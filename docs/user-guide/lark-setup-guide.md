# Lark/Feishu Setup Guide

## ✅ No Public IP Required!

This plugin uses **WebSocket long connection mode**, **no public IP** needed, runs directly on your local machine!

```
Your PC ←── WebSocket ───→ Feishu Server
        ↓
    Direct message reception
```

---

## 📱 Create Feishu App

### Step 1: Login to Feishu Open Platform

1. Visit [Feishu Open Platform](https://open.feishu.cn/)
2. Login with your Feishu account

### Step 2: Create Custom App

1. Click "Create Custom App" (创建自建应用)
2. Fill in app information:
   - **App Name**: `Buuo AI Assistant`
   - **App Description**: `Personal AI assistant supporting multi-turn conversations`
   - **App Icon**: (optional)

### Step 3: Get Credentials

Copy from **"Credentials & Basic Info"** page:

```
App ID:     cli_xxxxxxxxxxxxx      ← Copy this
App Secret: xxxxxxxxxxxxxxxxxxxx   ← Copy this
```

### Step 4: Configure Permissions

In **"Permission Management"** → **"Bulk Import"**:

```json
{
  "scopes": {
    "tenant": [
      "im:message",
      "im:message:send_as_bot",
      "im:chat.access_event.bot_p2p_chat:read",
      "im:message.group_at_msg:readonly",
      "im:message.p2p_msg:readonly",
      "contact:user.base_info:readonly"
    ]
  }
}
```

### Step 5: Enable Bot

In **"App Capabilities"** → **"Bot"**:
1. Enable bot capability
2. Set bot name

### Step 6: Configure Event Subscription (WebSocket Mode)

1. Go to **"Event Subscription"** (事件订阅)
2. **Select "Use Long Connection to Receive Events"** (使用长连接接收事件)
3. Add event: `im.message.receive_v1`
4. Click **"Save"** (保存)

✅ **No webhook URL needed**, WebSocket mode auto-connects!

### Step 7: Publish App

1. Go to **"Version Management & Release"**
2. Click **"Create Version"** (创建版本)
3. Fill version number: `1.0.0`
4. Click **"Apply for Release"** (申请发布)
5. Select **"Enterprise Internal"** (企业内部)

---

## ⚙️ Configure Buuo

### 1. Edit .env file

```bash
# Feishu configuration
LARK_APP_ID=cli_xxxxxxxxxxxxx
LARK_APP_SECRET=xxxxxxxxxxxxxxxxxxxx
```

### 2. Build project

```bash
pnpm build
```

### 3. Start gateway

```bash
./scripts/start-gateway.sh start
```

**Expected output:**
```
🦐 Buuo Gateway starting...
✓ Lark WebSocket connection established (no public IP required)
────────────────────────────────────────
  Channels: 1/1 connected
  Providers: 1/1 available
────────────────────────────────────────
```

---

## 🎮 Usage

### In Feishu

1. Search and open your app in Feishu
2. Send a message to start conversation
3. AI will auto-reply

### Supported Features

- ✅ Direct messaging
- ✅ Group @bot
- ✅ Multi-turn conversations
- ✅ Stream responses
- ✅ **No public IP required** (WebSocket long connection)

---

## 📊 Test Commands

```bash
# View configuration
./scripts/start-gateway.sh logs

# Check plugin status
npx tsx apps/cli/src/cli.ts plugin list

# Check gateway status
./scripts/start-gateway.sh status
```

---

## 🐛 Troubleshooting

### Issue 1: Can't receive messages

**Solution:**
1. Check if "Use Long Connection to Receive Events" is selected
2. Confirm gateway is running
3. View gateway logs

### Issue 2: Bot not responding

**Solution:**
1. Check App ID and App Secret are correct
2. Ensure Lark app is published
3. Check gateway logs for errors

### Issue 3: WebSocket connection failed

**Solution:**
1. Ensure network can access Feishu servers
2. Check App ID and App Secret
3. Try restarting gateway

---

## 📚 Reference Documentation

- [Feishu Open Platform Docs](https://open.feishu.cn/document)
- [Feishu Bot Development Guide](https://open.feishu.cn/document/ukTMukTMukTM/uUTNz4SN1MjL1UzM)
- [GitHub Repository](https://github.com/shylou/buuo)
- [Issue Tracker](https://github.com/shylou/buuo/issues)
