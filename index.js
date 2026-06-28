const { Client, GatewayIntentBits, SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const http = require('http');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;
const OWNER_ID = '1452136095788564614';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
    ]
});

// ملف تخزين الخيارات
const CONFIG_FILE = 'ticket-options.json';

function loadConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        } catch {
            return getDefaultConfig();
        }
    }
    return getDefaultConfig();
}

function getDefaultConfig() {
    return {
        options: [
            { name: 'استفسار', value: 'استفسار' },
            { name: 'شكوى', value: 'شكوى' },
            { name: 'طلب رتبة', value: 'طلب-رتبة' },
            { name: 'طلب برمجة', value: 'طلب-برمجة' }
        ],
        staffRoleId: null,
        logsChannelId: null
    };
}

function saveConfig(config) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

let config = loadConfig();
const tickets = new Map();
let ticketCounter = 0;

// دالة لإنشاء الأوامر ديناميكياً
function createCommands() {
    const currentConfig = loadConfig();
    
    return [
        new SlashCommandBuilder()
            .setName('ticket')
            .setDescription('فتح تكت جديد')
            .addStringOption(option => {
                const optionBuilder = option
                    .setName('type')
                    .setDescription('نوع التكت')
                    .setRequired(true);
                
                // أضف الخيارات الحالية
                const choices = currentConfig.options.map(opt => ({
                    name: opt.name,
                    value: opt.value
                }));
                
                choices.forEach(choice => {
                    optionBuilder.addChoice(choice.name, choice.value);
                });
                
                return optionBuilder;
            }),

        new SlashCommandBuilder()
            .setName('تعديل-خيارات-التكت')
            .setDescription('تعديل خيارات فتح التكت')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        new SlashCommandBuilder()
            .setName('setup-ticket')
            .setDescription('إعداد نظام التكتات')
            .addChannelOption(option =>
                option
                    .setName('logs_channel')
                    .setDescription('قناة اللوقات')
                    .setRequired(true))
            .addRoleOption(option =>
                option
                    .setName('staff_role')
                    .setDescription('رتبة المشرفين')
                    .setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        new SlashCommandBuilder()
            .setName('create-ticket-panel')
            .setDescription('إنشاء لوحة فتح التكتات')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    ].map(command => command.toJSON());
}

const { REST, Routes } = require('discord.js');
const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
    try {
        console.log('جاري تسجيل الأوامر...');
        const commands = createCommands();
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands }
        );
        console.log('✅ تم تسجيل الأوامر بنجاح!');
    } catch (error) {
        console.error('❌ خطأ في تسجيل الأوامر:', error);
    }
}

client.once('ready', async () => {
    console.log(`✅ البوت شغال: ${client.user.tag}`);
    await registerCommands();
});

client.on('interactionCreate', async (interaction) => {
    // معالجة الأزرار
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('close_ticket_')) {
            const ticketId = interaction.customId.replace('close_ticket_', '');
            const ticketData = tickets.get(ticketId);

            if (!ticketData) {
                return interaction.reply({ content: '❌ لم يتم العثور على التكت', ephemeral: true });
            }

            // التحقق من الصلاحيات
            if (interaction.user.id !== ticketData.owner && !interaction.member.roles.cache.has(ticketData.staffRoleId)) {
                return interaction.reply({ content: '❌ فقط صاحب التكت أو المشرفون يمكنهم إغلاق التكت', ephemeral: true });
            }

            try {
                await interaction.channel.delete();
                tickets.delete(ticketId);
                console.log(`✅ تم إغلاق التكت #${ticketId}`);
            } catch (e) {
                await interaction.reply({ content: '❌ حدث خطأ أثناء إغلاق التكت', ephemeral: true });
            }
        }
        return;
    }

    // معالجة الأوامر
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // أمر فتح التكت
    if (commandName === 'ticket') {
        await interaction.deferReply({ flags: 64 });
        
        const type = interaction.options.getString('type');
        const userId = interaction.user.id;
        const userName = interaction.user.username;
        
        ticketCounter++;
        const ticketId = `ticket_${ticketCounter}`;
        
        const currentConfig = loadConfig();

        try {
            if (!CATEGORY_ID) {
                return await interaction.editReply('❌ لم يتم تعيين الكاتيجوري. استخدم `/setup-ticket` أولاً');
            }

            const channel = await interaction.guild.channels.create({
                name: `تكت-${ticketCounter}`,
                type: 0,
                parent: CATEGORY_ID,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        deny: ['ViewChannel'],
                    },
                    {
                        id: userId,
                        allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
                    },
                    {
                        id: currentConfig.staffRoleId || interaction.guild.id,
                        allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageChannels'],
                    },
                ],
            });

            tickets.set(ticketId, {
                id: ticketId,
                channelId: channel.id,
                owner: userId,
                type: type,
                staffRoleId: currentConfig.staffRoleId,
                createdAt: new Date().toISOString(),
            });

            const closeButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`close_ticket_${ticketId}`)
                    .setLabel('🔴 إغلاق التكت')
                    .setStyle(ButtonStyle.Danger)
            );

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle(`🎫 تكت رقم #${ticketCounter}`)
                .setDescription(`مرحباً ${interaction.user}، سيقوم أحد المشرفين بخدمتك قريباً.`)
                .addFields(
                    { name: '📝 نوع التكت', value: type, inline: true },
                    { name: '👤 صاحب التكت', value: `${userName}`, inline: true },
                    { name: '📅 التاريخ', value: new Date().toLocaleString('ar-SA'), inline: false }
                )
                .setFooter({ text: `التكت #${ticketCounter}` });

            // منشن المشرفين
            if (currentConfig.staffRoleId) {
                await channel.send(`<@&${currentConfig.staffRoleId}>`);
            }
            await channel.send({ embeds: [embed], components: [closeButton] });

            await interaction.editReply(`✅ تم فتح التكت: ${channel}`);

        } catch (error) {
            console.error('خطأ في فتح التكت:', error);
            await interaction.editReply(`❌ فشل فتح التكت: ${error.message}`);
        }
    }

    // أمر تعديل الخيارات
    else if (commandName === 'تعديل-خيارات-التكت') {
        if (interaction.user.id !== OWNER_ID && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ ليس لديك صلاحية', ephemeral: true });
        }

        const currentConfig = loadConfig();
        const optionsText = currentConfig.options.map(opt => opt.name).join('\n');

        const modal = new ModalBuilder()
            .setCustomId('edit_options_modal')
            .setTitle('تعديل خيارات التكت');

        const optionsInput = new TextInputBuilder()
            .setCustomId('options_input')
            .setLabel('الخيارات (كل خيار في سطر)')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(optionsText)
            .setPlaceholder('استفسار\nشكوى\nطلب رتبة\nطلب برمجة');

        modal.addComponents(new ActionRowBuilder().addComponents(optionsInput));
        await interaction.showModal(modal);
    }

    // أمر الإعداد
    else if (commandName === 'setup-ticket') {
        const logsChannel = interaction.options.getChannel('logs_channel');
        const staffRole = interaction.options.getRole('staff_role');

        const currentConfig = loadConfig();
        currentConfig.logsChannelId = logsChannel.id;
        currentConfig.staffRoleId = staffRole.id;
        saveConfig(currentConfig);

        const embed = new EmbedBuilder()
            .setTitle('✅ تم إعداد نظام التكتات')
            .setColor(0x00FF00)
            .addFields(
                { name: '📋 قناة اللوقات', value: `${logsChannel}`, inline: true },
                { name: '👥 رتبة المشرفين', value: `${staffRole.name}`, inline: true }
            );

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // أمر إنشاء لوحة التكتات
    else if (commandName === 'create-ticket-panel') {
        const currentConfig = loadConfig();

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('ticket_select')
                .setPlaceholder('اختر نوع التكت...')
                .addOptions(
                    currentConfig.options.map(opt => ({
                        label: opt.name,
                        value: opt.value,
                        emoji: '🎫'
                    }))
                )
        );

        const embed = new EmbedBuilder()
            .setTitle('🎫 نظام التكتات')
            .setDescription('اختر من القائمة أدناه لفتح تكت جديد')
            .setColor(0x00FF00);

        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ تم إنشاء لوحة التكتات', ephemeral: true });
    }
});

// معالجة Select Menu
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isStringSelectMenu()) return;

    if (interaction.customId === 'ticket_select') {
        const type = interaction.values[0];
        const userId = interaction.user.id;
        const userName = interaction.user.username;

        ticketCounter++;
        const ticketId = `ticket_${ticketCounter}`;

        const currentConfig = loadConfig();

        try {
            if (!CATEGORY_ID) {
                return await interaction.reply({ content: '❌ لم يتم تعيين الكاتيجوري', ephemeral: true });
            }

            const channel = await interaction.guild.channels.create({
                name: `تكت-${ticketCounter}`,
                type: 0,
                parent: CATEGORY_ID,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        deny: ['ViewChannel'],
                    },
                    {
                        id: userId,
                        allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
                    },
                    {
                        id: currentConfig.staffRoleId || interaction.guild.id,
                        allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageChannels'],
                    },
                ],
            });

            tickets.set(ticketId, {
                id: ticketId,
                channelId: channel.id,
                owner: userId,
                type: type,
                staffRoleId: currentConfig.staffRoleId,
                createdAt: new Date().toISOString(),
            });

            const closeButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`close_ticket_${ticketId}`)
                    .setLabel('🔴 إغلاق التكت')
                    .setStyle(ButtonStyle.Danger)
            );

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle(`🎫 تكت رقم #${ticketCounter}`)
                .setDescription(`مرحباً ${interaction.user}، سيقوم أحد المشرفين بخدمتك قريباً.`)
                .addFields(
                    { name: '📝 نوع التكت', value: type, inline: true },
                    { name: '👤 صاحب التكت', value: `${userName}`, inline: true },
                    { name: '📅 التاريخ', value: new Date().toLocaleString('ar-SA'), inline: false }
                )
                .setFooter({ text: `التكت #${ticketCounter}` });

            // منشن المشرفين
            if (currentConfig.staffRoleId) {
                await channel.send(`<@&${currentConfig.staffRoleId}>`);
            }
            await channel.send({ embeds: [embed], components: [closeButton] });

            await interaction.reply({ content: `✅ تم فتح التكت: ${channel}`, ephemeral: true });

        } catch (error) {
            console.error('خطأ في فتح التكت:', error);
            await interaction.reply({ content: `❌ فشل فتح التكت: ${error.message}`, ephemeral: true });
        }
    }
});

// معالجة Modal
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isModalSubmit()) return;

    if (interaction.customId === 'edit_options_modal') {
        const optionsText = interaction.fields.getTextInputValue('options_input');
        const newOptions = optionsText
            .split('\n')
            .filter(line => line.trim())
            .map((name, index) => ({
                name: name.trim(),
                value: name.trim().toLowerCase().replace(/\s+/g, '-')
            }));

        if (newOptions.length === 0) {
            return interaction.reply({ content: '❌ لازم تضيف خيار واحد على الأقل', ephemeral: true });
        }

        const currentConfig = loadConfig();
        currentConfig.options = newOptions;
        saveConfig(currentConfig);

        // أعد تسجيل الأوامر مع الخيارات الجديدة
        await registerCommands();

        const embed = new EmbedBuilder()
            .setTitle('✅ تم تحديث الخيارات')
            .setColor(0x00FF00)
            .setDescription('الخيارات الجديدة:\n' + newOptions.map(opt => `• ${opt.name}`).join('\n'));

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
});

// سيرفر HTTP
http.createServer((req, res) => res.end('Ticket Bot is running!')).listen(process.env.PORT || 3000);

client.login(TOKEN);
