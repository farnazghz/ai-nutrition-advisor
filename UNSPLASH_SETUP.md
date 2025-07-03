# Unsplash API Setup (Free Food Images)

## Get Your Free Unsplash API Key

1. Go to [https://unsplash.com/developers](https://unsplash.com/developers)
2. Click "Register as a developer"
3. Create an account or login
4. Click "New Application"
5. Accept the terms and fill out the form:
   - **Application name**: "AI Nutrition Advisor"
   - **Description**: "Nutrition app that displays realistic food photos"
6. Copy your **Access Key**

## Add API Key to Server

1. Open `server-no-deps.js`
2. Find line 14 that says:
   ```javascript
   const UNSPLASH_ACCESS_KEY = 'your_unsplash_access_key_here';
   ```
3. Replace with your actual key:
   ```javascript
   const UNSPLASH_ACCESS_KEY = 'your_actual_access_key_from_unsplash';
   ```

## Features Added

- **Real food photos** instead of emojis
- **Smart fallback** to colored gradients if no photo found
- **Image caching** to avoid repeated API calls
- **Free tier**: 50 requests/hour (perfect for demo)

## How It Works

1. **First**: Tries to fetch real food photo from Unsplash
2. **Fallback**: Shows colored gradient with food name if no photo
3. **Cache**: Stores images to avoid re-fetching
4. **Fast**: Only loads images when ingredient cards are viewed

## Free Tier Limits

- ✅ **50 requests/hour** 
- ✅ **Demo & development** usage allowed
- ✅ **No credit card** required
- ✅ **High-quality photos** (400x300px)

Perfect for testing and demo purposes!