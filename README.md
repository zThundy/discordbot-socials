# Discord Socials Bot

A Node.js Discord bot for server administration and automatic announcements from Twitch, Twitter/X, and YouTube. It also provides role selectors, verification, ticket support, cross-server role synchronization, and a kick-channel moderation feature.

## Installation and configuration

### Requirements

- Node.js and npm
- A Discord bot application and bot token
- The bot invited to each Discord server where it will be used

### Install

1. Download or clone this repository and open a terminal in the project root.
2. Install the dependencies:

   ```sh
   npm i
   ```

   Wait for npm to finish installing all packages before continuing.

3. Rename the root-level `config_template.json` file to `config.json`. For example, in PowerShell:

   ```powershell
   Rename-Item config_template.json config.json
   ```

4. Open `config.json` and fill in **every field** with the correct values for your bot and integrations. Keep the JSON syntax valid: retain quotes around strings, use `true`/`false` for booleans, and do not leave trailing commas.
5. In the Discord Developer Portal, enable the **Server Members Intent** and **Message Content Intent** for the bot.
6. Invite the bot to your server with the permissions required by the features you plan to use. Depending on enabled commands, these include **View Channels**, **Send Messages**, **Read Message History**, **Embed Links**, **Manage Roles**, **Manage Channels**, **Kick Members**, **Manage Messages**, and **Attach Files**. The bot's highest role must be above the roles it needs to assign, remove, or synchronize.
7. Start the bot:

   ```sh
   npm start
   ```

   For development with automatic restarts, use `npm run dev`.

If `config.json` is missing at startup, the bot copies `config_template.json` to `config.json` and exits so you can fill it in. Restart the bot after completing the configuration.

### Configuration fields

| Field | Purpose |
| --- | --- |
| `token` | Discord bot token. Keep it private; do not commit it or share it. |
| `twitch.enabled` | Set to `true` to load `/twitch` and `/clips`. |
| `twitch.clientId`, `twitch.clientSecret` | Twitch application credentials used by Twitch features. |
| `tickets.folder` | Folder used to store generated ticket transcripts. |
| `uploader.folder` | Folder for uploaded or downloaded attachments used by the bot. |
| `uploader.httpIp`, `uploader.httpPort` | Address and port used by the attachment server. |
| `uploader.deleteFiles` | Whether uploaded files are automatically deleted. |
| `uploader.deleteFilesAfterDays` | Retention period in days when automatic file deletion is enabled. |
| `dashboard.publicUrl` | Public HTTP(S) origin for the dashboard; defaults to `https://dashboard.slushie.live`. |
| `dashboard.clientId`, `dashboard.clientSecret` | Discord OAuth2 application credentials used to authenticate moderator dashboard users. |
| `dashboard.redirectUri` | Optional full OAuth2 callback URL. Defaults to `<dashboard.publicUrl>/callback`. |
| `twitter.enabled` | Set to `true` to load `/twitter`. |
| `twitter.apiKey`, `twitter.apiSecret`, `twitter.bearerToken` | Credentials for the Twitter/X integration. |
| `youtube.enabled` | Set to `true` to load `/youtube`. |
| `bots` | Array of Discord server IDs (`guild_id`) where the bot should initialize. Add one object for each server. |

Optional integrations are disabled in the template. Configure their credentials before enabling them. Commands for disabled integrations are not registered.

## Slash commands

Commands are used in Discord by typing `/` and selecting the command. Except for `/help` and `/info`, the management commands are restricted to server administrators. `/kickchannel` requires the caller to have **Kick Members**, and `/modlogs` requires **Manage Server**. Optional social commands are available only when their integration is enabled in `config.json`.

### General

#### `/help`

Displays an in-Discord help embed. Its social integration entries depend on which integrations are enabled. This README contains the full command list.

#### `/info`

Displays information about the bot, its source repository, and the configured Discord servers where it is active.

#### `/nickname nickname:<name|reset>`

Changes the bot's nickname in the current server. Enter `reset` to restore the bot's default username.

### Roles and verification

#### `/roles action:<Send|Create selector|Edit selector|Delete selector>`

Creates and manages single-role selector panels.

- **Create selector** opens a form for the panel title and description, then lets you choose the roles users can select.
- **Send** posts a saved selector in the current channel. Users can select one role; choosing the remove option removes roles associated with that selector.
- **Edit selector** changes the title, description, and role choices.
- **Delete selector** removes a saved selector.

#### `/multiroles action:<Send|Create selector|Edit selector|Delete selector>`

Creates and manages multi-role selector panels.

- **Create selector** asks for a title, description, maximum choices per user, and the selectable roles.
- **Send** posts a saved panel in the current channel. Users can choose multiple roles up to the configured maximum.
- **Edit selector** changes the panel and replaces its role choices.
- **Delete selector** removes a saved selector.
- Sent panels include a button to remove all roles belonging to that selector from the user.

#### `/verify action:<Send|Create verify|Delete verify>`

Sets up and publishes the server's verification panel.

- **Create verify** asks you to mention the role to grant after verification.
- **Send** publishes a panel with a **Verify** button.
- **Delete verify** removes the saved verification configuration.

#### `/age action:<Send|Create|Delete>`

The command is registered for managing an age-role panel and exposes these actions. **The current `bot/commands/age.js` file does not implement the action handlers**, so this command is currently incomplete and should not be relied on.

### Tickets and moderation

#### Moderator log dashboard

The web dashboard is available at `https://dashboard.slushie.live` by default, and `/info` includes a **Moderator dashboard** link button. Configure `dashboard.clientId` and `dashboard.clientSecret` with a Discord OAuth2 application, or set `DISCORD_OAUTH_CLIENT_ID` and `DISCORD_OAUTH_CLIENT_SECRET` environment variables. Add the exact callback URL to the application's OAuth2 redirect URLs and enable the `identify` and `guilds` scopes. The default callback is `https://dashboard.slushie.live/callback`. For local development, set `dashboard.publicUrl` to `http://localhost:52320`; for a different public host, change `dashboard.publicUrl` (or `DASHBOARD_PUBLIC_URL`) and, if needed, set `dashboard.redirectUri` (or `DISCORD_OAUTH_REDIRECT_URI`) to match it exactly in the Discord application settings.

Point the DNS record for the public hostname to the server and configure its HTTPS reverse proxy to forward requests to the bot's local HTTP listener (`127.0.0.1:<uploader.httpPort>`). The bot's HTTP listener does not provision DNS records or TLS certificates.

Users must sign in with Discord and have the **Administrator** permission in a server where this bot is active. The dashboard rechecks their server permissions with Discord at least every 30 seconds and only returns logs for authorized servers. It provides server and operation filters, pagination, and the complete JSON payload for each log entry.

The dashboard also has **Ticket attachments** and **Tickets** tabs. It lists attachments from open tickets and saved closed-ticket transcripts, and provides access to each indexed transcript. Transcript HTML is downloaded only when an administrator clicks its ticket. Attachment previews and downloads use an authenticated endpoint that checks both administrator access to the selected server and that the file belongs to that ticket. When a ticket closes, the bot saves server-scoped metadata beside its HTML transcript so the dashboard can safely associate it with the correct server. Transcript files created before this metadata was added cannot be assigned to a server and are not listed. Attachment metadata remains visible when the corresponding file has expired; with the default uploader settings, the file itself is automatically deleted after 30 days.

All operations sent to the moderator log system are persisted to `bot/data/main.db`, even when no `/modlogs` channel is configured or its channel is unavailable. Stored details include Discord user/member, server and channel snapshots, operation metadata, message content and attachments where available, and before/after state for message edits. Interaction option values are stored in the JSON record. Treat this database as sensitive, restrict access to its backups, and use HTTPS when exposing the dashboard publicly. Dashboard sessions are held in memory and expire after 12 hours; restarting the bot signs users out. Log entries currently have no automatic retention limit.

#### `/ticket action:<Create setup|Send in channel|List configurations|Delete configuration> [config_id:<id>]`

Configures or publishes the ticket-opening panel.

- **Create setup** always creates a new configuration without replacing existing ones. It guides you through the panel title and description, whether the ticket form fields are required, their minimum lengths, and the ticket-channel prefix. You can also select staff roles and an optional transcript channel.
- At the end of setup, choose **Finish setup** to save the configuration, or **Send in channel** and provide a text-channel mention or ID to publish the panel there.
- **Send in channel** publishes the configured panel in the current channel. If there are multiple configurations, provide the desired `config_id`.
- **List configurations** shows each configuration's ID.
- **Delete configuration** displays the available IDs when `config_id` is omitted; run it again with the ID to delete only that configuration.

Each published panel uses its own configuration when opening tickets. The bot creates a private text channel under a `tickets` category. The ticket contains the submitted title and description, and can be closed with its **Close** button. Closing generates an HTML transcript, sends it to that configuration's transcript channel if one was selected, and deletes the ticket channel.

#### `/kickchannel action:<Enable in this channel|Disable> [message:<text>]`

Turns the current channel into a kick channel. When enabling it, provide `message` for the text shown in the warning embed. A user who posts in that channel is kicked, and the bot attempts to delete that user's messages from the server's text channels. The embed button shows the kick history in an ephemeral (private) response, with pagination.

The bot needs **Kick Members** to kick users and **View Channel** plus **Manage Messages** in the kick channel and the other channels whose message history should be cleaned. It can only remove messages from channels it can access and manage.

#### `/modlogs action:<Set this channel|Disable moderator logs>`

Run **Set this channel** in the text channel where moderators should receive log embeds. The bot needs **View Channel**, **Send Messages**, and **Embed Links** there. The setting is saved per server in the bot database. Choose **Disable moderator logs** to stop sending logs.

The log channel receives server interactions, member joins and leaves, nickname and role changes, voice-channel joins, leaves and moves, successful verification, kicks performed by the kick-channel feature, and deleted or edited messages. Message embeds include the author, channel, message ID, and content when available; long content is truncated, and uncached messages are marked accordingly. JSON records also include interaction option values and detailed user, member, channel, message, and operation snapshots where available.

### Cross-server roles

#### `/syncserver [action:<Add role sync|List synced roles|Remove role sync>]`

Sets up and manages bidirectional role pairs between two Discord servers.

- **Add role sync** asks for the two server IDs, then lets you select one role from each server.
- **List synced roles** displays role pairs involving the current server.
- **Remove role sync** removes a selected role pair.

The bot must be in both servers and have **Manage Roles** in both. The administrator configuring the pair must be an administrator in both servers, and the bot's highest role must be above both synchronized roles. Once configured, changes to a user's paired roles and qualifying member joins are synchronized between the servers.

### Social integrations

#### `/twitch [action:<List|Add|Remove>]`

Available when `twitch.enabled` is `true`. If no action is selected, the command opens the **Add** form.

- **Add** configures a Twitch channel name, a Discord announcement channel, and an optional role to mention. If no role is selected, announcements mention everyone.
- **List** shows the managed Twitch channels and their Discord destinations.
- **Remove** stops monitoring a selected Twitch channel.

#### `/clips action:<Toggle|Set channel>`

Available when `twitch.enabled` is `true` and a Twitch channel has been added with `/twitch`.

- **Toggle** enables or disables periodic new-clip checks for a selected Twitch channel.
- **Set channel** sets that Twitch account's clips channel to its configured Discord channel.

The current clips module checks for new clips and records them in the database; it does not currently post clip messages to Discord.

#### `/twitter action:<List|Add|Remove|Change tag>`

Available when `twitter.enabled` is `true`.

- **Add** starts monitoring the Twitter/X account name you enter in the current channel.
- **List** shows the monitored accounts and their Discord channels.
- **Remove** stops monitoring a selected account.
- **Change tag** sets or removes the role mention used for an account's announcements. Enter `delete` to remove the role mention; without a role, announcements mention everyone.

#### `/youtube action:<List|Add|Remove>`

Available when `youtube.enabled` is `true`.

- **Add** starts monitoring the YouTube channel name, handle, URL, or channel ID you enter in the current channel.
- **List** shows the managed YouTube channels and their Discord destinations.
- **Remove** stops monitoring a selected channel.

## Repository structure

```text
.
├── main.js                    # Discord client startup, intents, and event routing
├── package.json               # npm scripts and dependencies
├── package-lock.json          # Locked npm dependency versions
├── config_template.json       # Configuration template
├── config.json                # Local bot configuration (create from the template)
├── ticketTemplate.html        # HTML layout used for ticket transcripts
├── start.sh                   # Shell startup helper
├── scripts/
│   ├── inspect_db.js          # SQLite database inspection helper
│   └── test_db_query.js       # SQLite query helper
└── bot/
    ├── init.js                # Per-server initialization and command loading
    ├── commands/              # Slash commands and interaction handlers
    │   ├── age.js             # Age-role panel command (currently incomplete)
    │   ├── clips.js           # Twitch clip settings
    │   ├── help.js            # In-Discord help embed
    │   ├── info.js            # Bot and server information
    │   ├── kickchannel.js     # Kick channel, message cleanup, and kick history
    │   ├── multiroles.js      # Multi-role selector panels
    │   ├── nickname.js        # Bot nickname management
    │   ├── modlogs.js         # Moderator log channel configuration
    │   ├── roles.js           # Single-role selector panels
    │   ├── syncserver.js      # Cross-server role synchronization
    │   ├── ticket.js          # Ticket setup, opening, and closing
    │   ├── twitch.js          # Twitch channel monitoring
    │   ├── twitter.js         # Twitter/X account monitoring
    │   ├── verify.js          # Role-based verification
    │   ├── youtube.js         # YouTube channel monitoring
    │   └── elements/          # Reusable buttons, menus, modals, and selectors
    ├── modules/
    │   ├── configChecker.js   # Creates a config file from the template if needed
    │   ├── cron.js            # Scheduled task runner
    │   ├── database.js        # SQLite schema and persistence methods
    │   ├── httpDownload.js    # HTTP download helper
    │   ├── logger.js          # Log setup
    │   ├── makehtml.js        # Ticket transcript HTML generation
    │   ├── moderationDashboard.js # OAuth-protected moderator log dashboard
    │   ├── moderationLogs.js  # Shared moderator log embed sender and event snapshots
    │   ├── timeout.js         # Interaction cooldown helper
    │   ├── twitch.js          # Twitch API client
    │   ├── twitter.js         # Twitter/X API client
    │   ├── uploader.js        # Attachment storage and serving
    │   └── youtube.js         # YouTube lookup and embed helpers
    ├── dashboard/             # Moderator log dashboard interface
    ├── images/                # Static images used by integrations
    └── data/                  # Runtime data: SQLite DB, attachments, logs, transcripts
```

`bot/data/` is runtime storage; `bot/data/main.db` contains persistent bot settings and feature data. Back it up along with any files you need to retain. `node_modules/` is generated by `npm i` and should not be edited manually.
