# 1. OBJECTIVE
Add a complete user profile system to the NeonSkull Cyber-Chess application that enables users to:
- Upload and display custom profile pictures
- Manage friends with a request system (send/accept/decline)
- View friends' profiles, stats, and online/offline status
- Challenge friends directly to games from their profile
- View complete game history for all games (AI, Local, Online) with results, move history, timestamps, and opponent info

# 2. CONTEXT SUMMARY
**Existing System:**
- Cloudflare Workers backend (`worker.js`) with KV storage for user data
- WebSocket-based online multiplayer via `LobbyRoom` Durable Object
- Existing user schema: `id, username, passwordHash, friends[], rating, stats{won, lost, drawn}`
- Cyberpunk-themed HTML/CSS UI with sidebar navigation

**Key Files:**
- `worker.js` - Cloudflare Worker with REST API and WebSocket handling
- `index.html` - Main UI with sidebar tabs
- `users.json` - Local user data (development)

# 3. APPROACH OVERVIEW
**Storage Schema Changes:**
- Add `profilePicture` field (base64 string) to user object
- Add `gameHistory` array to store game records
- Add `friendRequests` array for incoming requests
- Add `outgoingRequests` array for sent requests

**Backend Changes:**
- New REST endpoints for profile picture upload, game history, friend requests
- Extend WebSocket messages for friend system and status updates

**Frontend Changes:**
- New "Profile" navigation tab with profile editor
- Profile view component (display picture, stats, friends list)
- Game history viewer with game replay
- Friends management UI (friends list, requests, search)

# 4. IMPLEMENTATION STEPS

## Step 1: Extend User Schema in Cloudflare Worker
**Goal:** Update user data model to support profile pictures, game history, and friend requests

**Method:** Modify `worker.js` to add new fields:
- Add `profilePicture` (string, base64 encoded image)
- Add `gameHistory` (array of game records)
- Add `friendRequests` (array of {userId, username} objects)
- Add `outgoingRequests` (array of {userId, username} objects)
- Add `lastSeen` timestamp for online status

**Reference:** `worker.js` lines 117-126 (user object creation in register)

## Step 2: Add Profile Picture Upload API
**Goal:** Allow users to upload profile pictures stored as base64

**Method:** Create new REST endpoint `POST /api/profile/picture`:
- Accept base64 image data in request body
- Validate image size (max 500KB) and format (jpeg/png/gif/webp)
- Store in user record in KV

**Reference:** New endpoint after line 156 in `worker.js`

## Step 3: Add Game History API
**Goal:** Enable storing and retrieving game history

**Method:** Create new REST endpoints:
- `POST /api/game/history` - Record completed game (called after game ends)
- `GET /api/game/history` - Retrieve user's game history
- `GET /api/game/history/:gameId` - Get specific game details

**Game record schema:**
```
{
  gameId: string,
  type: "ai" | "pvp" | "online",
  result: "win" | "loss" | "draw",
  opponent: { id, username } | "AI",
  timestamp: number,
  moves: [{from, to, san, promotion}],  // move history
  fen: string  // final position
}
```

**Reference:** New endpoints in `worker.js` fetch handler

## Step 4: Add Friend Request System API
**Goal:** Implement send/accept/decline friend requests

**Method:** Create WebSocket message handlers:
- `send-friend-request` - Add to target's friendRequests
- `accept-friend-request` - Move from requests to friends
- `decline-friend-request` - Remove from requests
- `remove-friend` - Remove from friends list
- `get-friend-requests` - Fetch pending requests

Add REST endpoints for profile data:
- `GET /api/user/:username` - Get public profile (for viewing friends)
- `GET /api/friends` - Get friends list with online status

**Reference:** New cases in `worker.js` WebSocket message handler (around line 202)

## Step 5: Update Game End to Record History
**Goal:** Automatically record games to history when they complete

**Method:** Modify existing `game-over-sync` handler to also:
- Call game history API to record the game
- Update both players' game history

**Reference:** `worker.js` around line 250-268

## Step 6: Add Profile Tab UI in HTML
**Goal:** Add new Profile navigation tab to the sidebar

**Method:** Add new tab button and drawer panel in `index.html`:
- Add `<button class="nav-tab-cyber" id="tab-profile">` in nav-tabs
- Add `<div class="drawer-panel-cyber" id="panel-profile">` with:
  - Profile picture display and upload button
  - Username display (read-only)
  - Rating display
  - Stats (wins/losses/draws)
  - Edit profile button

**Reference:** `index.html` line 41-66 (nav tabs), line 77-123 (drawer panels)

## Step 7: Add Friends Panel UI
**Goal:** Display and manage friends in the Profile tab

**Method:** Add to Profile panel:
- Friends section showing:
  - Friend cards with avatar, username, rating, online status
  - Click to view friend's full profile
  - Challenge button to invite friend to game
- Pending requests section:
  - Accept/Decline buttons for incoming requests
- Add Friend input to search and send requests

**Reference:** New panel content in `index.html`

## Step 8: Add Game History Viewer UI
**Goal:** Display and interact with game history

**Method:** Add history panel in Profile tab:
- List of past games (grouped by date)
- Show: opponent, result, date, game type
- Click game to view details
- Game detail view:
  - Replay moves (prev/next buttons)
  - Final FEN position display
  - Result and date info

**Reference:** New panel content in `index.html`

## Step 9: Add Frontend JavaScript Logic
**Goal:** Connect UI to backend APIs

**Method:** Add functions in `app.js`:
- `uploadProfilePicture(file)` - Handle image upload
- `loadProfile()` - Fetch and display user profile
- `loadFriends()` - Fetch friends list with status
- `loadGameHistory()` - Fetch and display history
- `sendFriendRequest(username)` - Send request
- `acceptFriendRequest(userId)` - Accept request
- `declineFriendRequest(userId)` - Decline request
- `removeFriend(userId)` - Remove friend
- `challengeFriend(userId)` - Start game with friend
- `viewGame(gameId)` - View/replay specific game
- Socket listeners for friend status updates

**Reference:** New functions in `app.js`

## Step 10: Update Online Status Broadcasting
**Goal:** Show real-time online/offline status for friends

**Method:** Enhance `worker.js` to:
- Track and broadcast `user-online` / `user-offline` events
- Include `lastSeen` timestamp in friend data
- Update status when users connect/disconnect

**Reference:** `worker.js` `_broadcastOnlineStatus()` around line 377

# 5. TESTING AND VALIDATION

**Verification Criteria:**
1. User can register/login and see Profile tab
2. User can upload an image as profile picture (up to 500KB)
3. User can send friend request to another user
4. User can accept/decline incoming friend requests
5. User can see friends list with online/offline status
6. User can click friend to view their profile and stats
7. User can challenge friend to a game
8. After playing any game (AI/Local/Online), game appears in history
9. User can click game in history to view details
10. User can replay moves in game history viewer

**Manual Test Scenarios:**
1. Register two users, upload different profile pictures, verify both display correctly
2. User A sends friend request to User B, verify User B sees it and can accept
3. After accepting, verify User A sees B in friends list
4. Play an AI game, verify it appears in game history
5. Play an online game, verify it appears in both players' history
6. View a past game and replay moves to verify correctness
7. One user goes online, friend's status shows "Online"
