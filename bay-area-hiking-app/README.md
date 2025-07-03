# 🥾 Bay Area Hiking Discovery App

A Tinder-style hiking discovery app that helps you find the perfect Bay Area trails through swipe-based recommendations, social proof integration, and drag-and-drop calendar planning.

## ✨ Features

### 🔍 Smart Discovery
- **Tinder-style swiping** for hiking recommendations
- **Interest-based filtering** by difficulty, distance, scenery, and features
- **Social proof integration** from YouTube, Google Maps, and Reddit
- **Real-time recommendation engine** that learns from your preferences

### 📱 Intuitive Interface
- **Swipe gestures** (mouse drag or touch) to like/reject trails
- **Responsive design** that works on mobile and desktop
- **Beautiful cards** with high-quality hiking photos
- **Smooth animations** and modern UI

### 📅 Planning Tools
- **Draggable calendar** to schedule your hiking adventures
- **Drag and drop** liked hikes onto calendar dates
- **Visual planning** with month navigation
- **Event management** for your hiking schedule

### 🌐 Data Integration
- **YouTube API** for trail review videos
- **Google Maps API** for ratings and reviews
- **Reddit integration** for community recommendations
- **Unsplash images** for beautiful trail photography

## 🚀 Quick Start

1. **Clone and setup:**
   ```bash
   cd /Users/amirtakhmar/bay-area-hiking-app
   npm start
   ```

2. **Open your browser:**
   ```
   http://localhost:3003
   ```

3. **Configure API keys** (optional, sample data works without them):
   - YouTube Data API v3 key
   - Google Maps Places API key
   - Add them to `server.js`

## 🎯 How to Use

### 1. Set Preferences
- Navigate to the **⚙️ Preferences** tab
- Choose your difficulty level (Easy → Very Hard)
- Select distance range (0-3 miles → 15+ miles)
- Pick preferred scenery (Mountains, Water, Forest, etc.)
- Select desired features (Parking, Restrooms, Dog-friendly, etc.)

### 2. Discover Trails
- Go to **🔍 Discover** tab
- Swipe right ❤️ on trails you like
- Swipe left ❌ on trails you're not interested in
- Use the buttons or drag the cards
- Get social proof from YouTube videos and Reddit discussions

### 3. Plan Your Adventures
- Visit **📅 Plan** tab
- See your liked hikes in the bottom section
- Drag hikes onto calendar dates to schedule them
- Navigate between months to plan ahead

## 🏞️ Sample Bay Area Trails

The app includes these amazing Bay Area hiking spots:

- **Muir Woods National Monument** - Ancient redwoods (Easy, 2.5 mi)
- **Half Dome Trail** - Iconic Yosemite granite dome (Very Hard, 16.5 mi)
- **Lands End Lookout** - Coastal SF views (Easy, 1.5 mi)
- **Mount Tamalpais** - 360° Bay Area views (Moderate, 7.2 mi)
- **Alamere Falls** - Beach waterfall (Moderate, 8.5 mi)

## 🛠️ Technical Architecture

### Backend (Node.js)
- **Express-free HTTP server** for lightweight performance
- **RESTful API** for recommendations and preferences
- **No external dependencies** - pure Node.js
- **YouTube/Google Maps integration** for social proof
- **Smart recommendation algorithm** based on user preferences

### Frontend (Vanilla JavaScript)
- **Modern CSS Grid/Flexbox** layout
- **Drag and drop API** for calendar functionality
- **Touch/mouse gesture support** for swiping
- **Responsive design** with mobile-first approach
- **Vanilla JS** - no framework dependencies

## 📡 API Endpoints

- `GET /api/recommendations` - Get personalized hiking recommendations
- `POST /api/preferences` - Update user preferences
- `GET /api/preferences` - Get current user preferences
- `GET /api/liked-hikes` - Get user's liked hikes for calendar

## 🎨 Customization

### Add New Trails
Edit the `sampleHikes` array in `server.js`:

```javascript
{
    id: 6,
    name: "Your Trail Name",
    location: "City, CA",
    difficulty: "moderate",
    distance: 5.0,
    elevation: 800,
    scenery: ["forest", "creek"],
    features: ["parking", "restrooms"],
    description: "Trail description",
    rating: 4.5,
    reviewCount: 1000,
    image: "trail-image-url",
    coordinates: { lat: 37.0000, lng: -122.0000 }
}
```

### Styling
Customize colors in the CSS `:root` variables:

```css
:root {
    --primary: #2d5a27;          /* Main brand color */
    --accent: #8bc34a;           /* Accent color */
    --gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
```

## 🌟 Future Enhancements

- **Real Reddit API integration** for live community data
- **Weather integration** for trail conditions
- **User accounts** and profile management
- **Social sharing** of hiking plans
- **Trail difficulty prediction** based on user fitness level
- **Offline mode** for trail maps
- **Photo sharing** from completed hikes
- **Trail condition updates** from community

## 🔧 Development

### Local Development
```bash
# Start the server
node server.js

# The app will be available at http://localhost:3003
```

### Project Structure
```
bay-area-hiking-app/
├── server.js              # Main backend server
├── package.json          # Project configuration
├── README.md            # This file
└── public/
    └── index.html       # Frontend application
```

## 📝 License

MIT License - feel free to use this project as a foundation for your own hiking discovery app!

## 🤝 Contributing

This is a great foundation for building a full hiking discovery platform. Areas for contribution:
- Additional trail data
- Real API integrations
- Mobile app development
- Trail condition tracking
- Community features

---

**Ready to discover your next adventure? Start swiping! 🥾✨**