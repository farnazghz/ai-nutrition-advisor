# ElevenLabs Setup Instructions

## Add Your ElevenLabs API Key

1. Open `server-no-deps.js`
2. Find line 13 that says:
   ```javascript
   const ELEVENLABS_API_KEY = 'your_elevenlabs_api_key_here';
   ```
3. Replace `'your_elevenlabs_api_key_here'` with your actual ElevenLabs API key:
   ```javascript
   const ELEVENLABS_API_KEY = 'sk_dba83816e5c6a24155f6a970e5001cddebab3140aaabc7a1';
   ```

## Features Added

- **ElevenLabs Voice**: High-quality text-to-speech for Good Foods only
- **Clean Interface**: Removed Farsi from all sections
- **Voice Button**: Only appears on Good Foods cards
- **Professional Audio**: Uses ElevenLabs Adam voice model

## How It Works

1. Go to Food & Nutrition Guide → Good Foods
2. Click "🎤 Listen with ElevenLabs" on any good food item
3. The button will show "🔄 Generating..." while creating audio
4. Then "🔊 Playing..." while the high-quality voice plays
5. Returns to normal when finished

## Voice Content

The voice will read:
- Food name (e.g., "Grass-Fed Butter")
- Dr. Berg's explanation in natural language
- Perfect for creating video content or listening while working

Note: Voice generation requires an active ElevenLabs subscription.