import {
  ActionRowBuilder,
  ApplicationCommandType,
  ApplicationIntegrationType,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ContextMenuCommandBuilder,
  Interaction,
  InteractionContextType,
  Message,
  MessageContextMenuCommandInteraction,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { randomBytes } from 'node:crypto';

import {
  CARD_COLOURS,
  CARD_FONTS,
  CARD_LOOKS,
  CARD_SIZES,
  CardOptions,
  renderQuoteCard,
} from './quote-card.js';

const SESSION_LIFETIME = 14 * 60 * 1_000;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const EDITOR_MESSAGE = 'Customize the quote, then post it when ready.';

type QuoteSession = {
  id: string;
  ownerId: string;
  sourceMessage: Message;
  options: CardOptions;
  primaryImage?: Buffer;
  avatarImage?: Buffer;
  expiresAt: number;
  busy: boolean;
};

const sessions = new Map<string, QuoteSession>();

export const quoteCommand = new ContextMenuCommandBuilder()
  .setName('Quote Message')
  .setType(ApplicationCommandType.Message)
  .setIntegrationTypes(
    ApplicationIntegrationType.GuildInstall,
    ApplicationIntegrationType.UserInstall,
  )
  .setContexts(
    InteractionContextType.Guild,
    InteractionContextType.BotDM,
    InteractionContextType.PrivateChannel,
  );

export async function handleQuoteInteraction(interaction: Interaction): Promise<boolean> {
  const isQuoteCommand =
    interaction.isMessageContextMenuCommand() &&
    interaction.commandName === quoteCommand.name;
  const isQuoteComponent =
    (interaction.isStringSelectMenu() ||
      interaction.isButton() ||
      interaction.isModalSubmit()) &&
    interaction.customId.startsWith('quote:');

  if (!isQuoteCommand && !isQuoteComponent) return false;

  try {
    if (isQuoteCommand) {
      await createQuoteSession(interaction);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelect(interaction);
    } else if (interaction.isButton()) {
      await handleButton(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModal(interaction);
    }
  } catch (error) {
    console.error('Quote interaction failed:', error);
    await safelyReportError(interaction);
  }

  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(id);
  }
}, 60_000).unref();

async function createQuoteSession(
  interaction: MessageContextMenuCommandInteraction,
): Promise<void> {
  await interaction.deferReply();

  const message = interaction.targetMessage;
  const id = randomBytes(6).toString('base64url');
  const primaryUrl = findPrimaryImage(message);
  const avatarUrl = message.author.displayAvatarURL({
    extension: 'png',
    size: 1024,
  });

  const [primaryImage, avatarImage] = await Promise.all([
    primaryUrl ? downloadImage(primaryUrl) : Promise.resolve(undefined),
    downloadImage(avatarUrl),
  ]);

  const session: QuoteSession = {
    id,
    ownerId: interaction.user.id,
    sourceMessage: message,
    options: {
      quote: extractQuoteText(message),
      credit: displayNameFor(message),
      font: 'modern',
      size: 'auto',
      colour: 'auto',
      look: primaryImage ? 'split-original' : 'minimal-ink',
    },
    primaryImage,
    avatarImage,
    expiresAt: Date.now() + SESSION_LIFETIME,
    busy: false,
  };

  sessions.set(id, session);
  const preview = await makePreview(session);

  await interaction.editReply({
    content: EDITOR_MESSAGE,
    files: [preview],
    components: buildControls(session),
  });
}

async function handleSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const parsed = parseCustomId(interaction.customId);
  const session = getOwnedSession(parsed.sessionId, interaction.user.id);

  if (!session) {
    await interaction.reply({
      content: 'That quote editor has expired. Run **Apps → Quote Message** again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (session.busy) {
    await interaction.reply({
      content: 'The preview is still rendering.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const value = interaction.values[0];
  if (!value) return;

  if (parsed.action === 'font' && value in CARD_FONTS) {
    session.options.font = value as CardOptions['font'];
  } else if (parsed.action === 'size' && value in CARD_SIZES) {
    session.options.size = value as CardOptions['size'];
  } else if (parsed.action === 'colour' && value in CARD_COLOURS) {
    session.options.colour = value as CardOptions['colour'];
  } else if (parsed.action === 'look' && value in CARD_LOOKS) {
    session.options.look = value as CardOptions['look'];
  } else {
    await interaction.reply({
      content: 'That option is no longer available.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  session.busy = true;
  session.expiresAt = Date.now() + SESSION_LIFETIME;
  await interaction.deferUpdate();

  try {
    const preview = await makePreview(session);
    await interaction.editReply({
      content: EDITOR_MESSAGE,
      attachments: [],
      files: [preview],
      components: buildControls(session),
    });
  } finally {
    session.busy = false;
  }
}

async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const parsed = parseCustomId(interaction.customId);
  const session = getOwnedSession(parsed.sessionId, interaction.user.id);

  if (!session) {
    await interaction.reply({
      content: 'That quote editor has expired. Run **Apps → Quote Message** again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (session.busy) {
    await interaction.reply({
      content: 'The preview is still rendering.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (parsed.action === 'edit') {
    const modal = new ModalBuilder()
      .setCustomId(`quote:${session.id}:modal`)
      .setTitle('Edit quote');

    const quoteInput = new TextInputBuilder()
      .setCustomId('quoteText')
      .setLabel('Quote')
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(600)
      .setRequired(true)
      .setValue(session.options.quote.slice(0, 600));

    const creditInput = new TextInputBuilder()
      .setCustomId('creditText')
      .setLabel('Credit (leave blank to hide)')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(80)
      .setRequired(false)
      .setValue(session.options.credit.slice(0, 80));

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(quoteInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(creditInput),
    );

    await interaction.showModal(modal);
    return;
  }

  if (parsed.action === 'shuffle') {
    session.options.font = randomKey(CARD_FONTS);
    session.options.size = randomKey(CARD_SIZES);
    session.options.colour = randomKey(CARD_COLOURS);
    session.options.look = randomKey(CARD_LOOKS);
    session.busy = true;
    await interaction.deferUpdate();

    try {
      const preview = await makePreview(session);
      await interaction.editReply({
        content: EDITOR_MESSAGE,
        attachments: [],
        files: [preview],
        components: buildControls(session),
      });
    } finally {
      session.busy = false;
    }
    return;
  }

  if (parsed.action === 'post') {
    session.busy = true;
    await interaction.deferUpdate();

    try {
      const image = await renderSession(session);
      const sourceButton = new ButtonBuilder()
        .setLabel('View original')
        .setStyle(ButtonStyle.Link)
        .setURL(session.sourceMessage.url);

      await interaction.followUp({
        files: [
          new AttachmentBuilder(image, {
            name: `quote-${session.sourceMessage.id}.png`,
            description: `Quote by ${session.options.credit || 'an unnamed author'}`,
          }),
        ],
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(sourceButton),
        ],
        allowedMentions: { parse: [] },
      });

      sessions.delete(session.id);
      await interaction.editReply({
        content: 'Quote posted.',
        attachments: [],
        components: [],
      });
    } finally {
      session.busy = false;
    }
    return;
  }

  if (parsed.action === 'close') {
    sessions.delete(session.id);
    await interaction.update({
      content: 'Quote editor closed.',
      attachments: [],
      components: [],
    });
  }
}

async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const parsed = parseCustomId(interaction.customId);
  const session = getOwnedSession(parsed.sessionId, interaction.user.id);

  if (!session) {
    await interaction.reply({
      content: 'That quote editor has expired. Run **Apps → Quote Message** again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  session.options.quote = interaction.fields
    .getTextInputValue('quoteText')
    .trim()
    .slice(0, 600);
  session.options.credit = interaction.fields
    .getTextInputValue('creditText')
    .trim()
    .slice(0, 80);
  session.expiresAt = Date.now() + SESSION_LIFETIME;
  session.busy = true;

  await interaction.deferUpdate();
  try {
    const preview = await makePreview(session);
    await interaction.editReply({
      content: EDITOR_MESSAGE,
      attachments: [],
      files: [preview],
      components: buildControls(session),
    });
  } finally {
    session.busy = false;
  }
}

function buildControls(session: QuoteSession) {
  const font = new StringSelectMenuBuilder()
    .setCustomId(`quote:${session.id}:font`)
    .setPlaceholder('Choose a font')
    .addOptions(
      Object.entries(CARD_FONTS).map(([value, item]) => ({
        label: item.label,
        description: item.description,
        value,
        default: value === session.options.font,
      })),
    );

  const size = new StringSelectMenuBuilder()
    .setCustomId(`quote:${session.id}:size`)
    .setPlaceholder('Choose a text size')
    .addOptions(
      Object.entries(CARD_SIZES).map(([value, item]) => ({
        label: item.label,
        description: item.description,
        value,
        default: value === session.options.size,
      })),
    );

  const colour = new StringSelectMenuBuilder()
    .setCustomId(`quote:${session.id}:colour`)
    .setPlaceholder('Choose a text colour')
    .addOptions(
      Object.entries(CARD_COLOURS).map(([value, item]) => ({
        label: item.label,
        description: item.description,
        value,
        default: value === session.options.colour,
      })),
    );

  const look = new StringSelectMenuBuilder()
    .setCustomId(`quote:${session.id}:look`)
    .setPlaceholder('Choose a layout and image effect')
    .addOptions(
      Object.entries(CARD_LOOKS).map(([value, item]) => ({
        label: item.label,
        description: item.description,
        value,
        default: value === session.options.look,
      })),
    );

  const actions = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`quote:${session.id}:edit`)
      .setLabel('Edit words')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`quote:${session.id}:shuffle`)
      .setLabel('Surprise me')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`quote:${session.id}:post`)
      .setLabel('Post quote')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`quote:${session.id}:close`)
      .setLabel('Close')
      .setStyle(ButtonStyle.Danger),
  );

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(font),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(size),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(colour),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(look),
    actions,
  ];
}

async function makePreview(session: QuoteSession): Promise<AttachmentBuilder> {
  const image = await renderSession(session);
  return new AttachmentBuilder(image, {
    name: `quote-preview-${session.id}.png`,
    description: 'Live preview of the customized quote card',
  });
}

function renderSession(session: QuoteSession): Promise<Buffer> {
  return renderQuoteCard({
    ...session.options,
    primaryImage: session.primaryImage,
    avatarImage: session.avatarImage,
  });
}

function getOwnedSession(id: string, userId: string): QuoteSession | undefined {
  const session = sessions.get(id);
  if (!session || session.expiresAt <= Date.now() || session.ownerId !== userId) {
    if (session?.expiresAt && session.expiresAt <= Date.now()) sessions.delete(id);
    return undefined;
  }
  return session;
}

function parseCustomId(customId: string): { sessionId: string; action: string } {
  const [, sessionId = '', action = ''] = customId.split(':');
  return { sessionId, action };
}

function extractQuoteText(message: Message): string {
  const fromContent = message.cleanContent?.trim() || message.content.trim();
  const fromEmbed = message.embeds
    .map((embed) => embed.description || embed.title)
    .find((value): value is string => Boolean(value?.trim()));

  const text = (fromContent || fromEmbed || 'Shared a moment worth remembering')
    .replace(/<a?:([a-zA-Z0-9_]+):\d+>/g, ':$1:')
    .replace(/\s{3,}/g, '\n\n')
    .trim();

  return text.slice(0, 600);
}

function displayNameFor(message: Message): string {
  if (message.member?.displayName) return message.member.displayName;
  return message.author.globalName || message.author.username;
}

function findPrimaryImage(message: Message): string | undefined {
  const attachment = message.attachments.find(
    (item) =>
      item.contentType?.startsWith('image/') ||
      /\.(?:png|jpe?g|webp|gif)$/i.test(item.name),
  );
  if (attachment) return attachment.proxyURL || attachment.url;

  for (const embed of message.embeds) {
    if (embed.image?.proxyURL || embed.image?.url) {
      return embed.image.proxyURL || embed.image.url;
    }
    if (embed.thumbnail?.proxyURL || embed.thumbnail?.url) {
      return embed.thumbnail.proxyURL || embed.thumbnail.url;
    }
  }

  return undefined;
}

async function downloadImage(url: string): Promise<Buffer | undefined> {
  try {
    const parsedUrl = new URL(url);
    const trustedHost =
      parsedUrl.protocol === 'https:' &&
      (parsedUrl.hostname === 'discordapp.com' ||
        parsedUrl.hostname.endsWith('.discordapp.com') ||
        parsedUrl.hostname === 'discordapp.net' ||
        parsedUrl.hostname.endsWith('.discordapp.net'));
    if (!trustedHost) return undefined;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
      headers: { 'User-Agent': 'QuoteCardDiscordApp/1.0' },
    });
    if (!response.ok) return undefined;

    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_IMAGE_BYTES) return undefined;

    if (!response.body) return undefined;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_IMAGE_BYTES) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(value);
    }

    return Buffer.concat(chunks, totalBytes);
  } catch (error) {
    console.warn(`Could not download image: ${String(error)}`);
    return undefined;
  }
}

function randomKey<T extends Record<string, unknown>>(record: T): keyof T {
  const keys = Object.keys(record) as Array<keyof T>;
  return keys[Math.floor(Math.random() * keys.length)]!;
}

async function safelyReportError(interaction: Interaction): Promise<void> {
  if (!interaction.isRepliable()) return;
  const message = {
    content: 'Could not render the quote. Please try again.',
    flags: MessageFlags.Ephemeral,
  } as const;

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(message);
    } else {
      await interaction.reply(message);
    }
  } catch {
  }
}
