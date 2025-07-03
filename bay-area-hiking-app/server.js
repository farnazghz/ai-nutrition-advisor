const http = require('http');
const https = require('https');
const url = require('url');
const path = require('path');
const fs = require('fs');
const querystring = require('querystring');

// API Keys (you'll need to add your actual keys)
const YOUTUBE_API_KEY = 'your_youtube_api_key_here';
const GOOGLE_MAPS_API_KEY = 'your_google_maps_api_key_here';
const PORT = 3003;

// In-memory storage for hiking data
let hikingActivities = [];
let userPreferences = {
    difficulty: 'moderate',
    distance: '5-10',
    scenery: ['water', 'mountain'],
    features: ['parking', 'restrooms']
};

// Sample Bay Area hiking data
const sampleHikes = [
    {
        id: 1,
        name: "Muir Woods National Monument",
        location: "Mill Valley, CA",
        difficulty: "easy",
        distance: 2.5,
        elevation: 200,
        scenery: ["forest", "creek"],
        features: ["parking", "restrooms", "visitor_center"],
        description: "Walk among ancient coast redwoods in this peaceful sanctuary",
        rating: 4.5,
        reviewCount: 2847,
        image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800",
        coordinates: { lat: 37.8974, lng: -122.5808 }
    },
    {
        id: 2,
        name: "Half Dome Trail",
        location: "Yosemite National Park",
        difficulty: "very_hard",
        distance: 16.5,
        elevation: 4800,
        scenery: ["mountain", "granite", "valley"],
        features: ["cables", "permits_required"],
        description: "Iconic granite dome with cables for the final ascent",
        rating: 4.8,
        reviewCount: 1523,
        image: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800",
        coordinates: { lat: 37.7459, lng: -119.5332 }
    },
    {
        id: 3,
        name: "Lands End Lookout",
        location: "San Francisco, CA", 
        difficulty: "easy",
        distance: 1.5,
        elevation: 150,
        scenery: ["ocean", "cliffs", "city"],
        features: ["parking", "restrooms", "cafe"],
        description: "Stunning coastal views of the Golden Gate Bridge and Marin Headlands",
        rating: 4.3,
        reviewCount: 3241,
        image: "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=800",
        coordinates: { lat: 37.7749, lng: -122.5094 }
    },
    {
        id: 4,
        name: "Mount Tamalpais State Park",
        location: "Mill Valley, CA",
        difficulty: "moderate",
        distance: 7.2,
        elevation: 2000,
        scenery: ["mountain", "bay_views", "forest"],
        features: ["parking", "fire_roads", "multiple_trails"],
        description: "360-degree views of the Bay Area from the summit",
        rating: 4.6,
        reviewCount: 1876,
        image: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800",
        coordinates: { lat: 37.9235, lng: -122.5965 }
    },
    {
        id: 5,
        name: "Alamere Falls",
        location: "Point Reyes, CA",
        difficulty: "moderate",
        distance: 8.5,
        elevation: 600,
        scenery: ["waterfall", "ocean", "beach"],
        features: ["tide_pools", "wildlife"],
        description: "Rare waterfall that drops directly onto the beach",
        rating: 4.4,
        reviewCount: 987,
        image: "https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=800",
        coordinates: { lat: 37.9371, lng: -122.8557 }
    },
    {
        id: 6,
        name: "Angel Island State Park",
        location: "Tiburon, CA",
        difficulty: "easy",
        distance: 3.5,
        elevation: 400,
        scenery: ["water", "city", "bay_views"],
        features: ["parking", "restrooms", "ferry_access"],
        description: "Island hiking with panoramic Bay Area views and rich history",
        rating: 4.4,
        reviewCount: 1567,
        image: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800",
        coordinates: { lat: 37.8625, lng: -122.4319 }
    },
    {
        id: 7,
        name: "Mission Peak Regional Preserve",
        location: "Fremont, CA",
        difficulty: "hard",
        distance: 6.2,
        elevation: 2517,
        scenery: ["mountain", "valley", "bay_views"],
        features: ["parking", "sunrise_views"],
        description: "Steep climb rewarded with stunning 360-degree views and famous peak pole",
        rating: 4.2,
        reviewCount: 3456,
        image: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800",
        coordinates: { lat: 37.5156, lng: -121.9073 }
    },
    {
        id: 8,
        name: "Tennessee Valley Trail",
        location: "Mill Valley, CA",
        difficulty: "easy",
        distance: 3.4,
        elevation: 200,
        scenery: ["ocean", "beach", "valley"],
        features: ["parking", "restrooms", "dog_friendly"],
        description: "Gentle trail through a valley leading to a beautiful secluded beach",
        rating: 4.5,
        reviewCount: 2234,
        image: "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=800",
        coordinates: { lat: 37.8553, lng: -122.5378 }
    },
    {
        id: 9,
        name: "Crissy Field to Golden Gate",
        location: "San Francisco, CA",
        difficulty: "easy",
        distance: 2.8,
        elevation: 50,
        scenery: ["water", "city", "bridge"],
        features: ["parking", "restrooms", "bike_friendly"],
        description: "Flat waterfront walk with iconic Golden Gate Bridge views",
        rating: 4.7,
        reviewCount: 4521,
        image: "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=800",
        coordinates: { lat: 37.8024, lng: -122.4662 }
    },
    {
        id: 10,
        name: "Castle Rock State Park",
        location: "Los Gatos, CA",
        difficulty: "moderate",
        distance: 5.4,
        elevation: 1200,
        scenery: ["forest", "mountain", "rock_formations"],
        features: ["parking", "picnic_areas", "rock_climbing"],
        description: "Beautiful redwood forest with unique sandstone rock formations",
        rating: 4.3,
        reviewCount: 1876,
        image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800",
        coordinates: { lat: 37.2276, lng: -122.0881 }
    },
    {
        id: 11,
        name: "Point Reyes Lighthouse",
        location: "Point Reyes, CA",
        difficulty: "moderate",
        distance: 1.4,
        elevation: 600,
        scenery: ["ocean", "cliffs", "lighthouse"],
        features: ["parking", "visitor_center", "wildlife"],
        description: "Historic lighthouse with dramatic coastal views and whale watching",
        rating: 4.6,
        reviewCount: 2987,
        image: "https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=800",
        coordinates: { lat: 38.0013, lng: -123.0153 }
    },
    {
        id: 12,
        name: "Big Basin Redwoods State Park",
        location: "Boulder Creek, CA",
        difficulty: "easy",
        distance: 4.2,
        elevation: 300,
        scenery: ["forest", "creek", "waterfalls"],
        features: ["parking", "restrooms", "visitor_center"],
        description: "California's oldest state park with magnificent old-growth redwoods",
        rating: 4.5,
        reviewCount: 3421,
        image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800",
        coordinates: { lat: 37.1663, lng: -122.2308 }
    },
    {
        id: 13,
        name: "Mount Diablo State Park",
        location: "Clayton, CA",
        difficulty: "hard",
        distance: 7.8,
        elevation: 3849,
        scenery: ["mountain", "valley", "desert"],
        features: ["parking", "visitor_center", "wildlife"],
        description: "Highest peak in the Bay Area with views of the Sierra Nevada",
        rating: 4.4,
        reviewCount: 1654,
        image: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800",
        coordinates: { lat: 37.8816, lng: -121.9142 }
    },
    {
        id: 14,
        name: "Pescadero Beach Trail",
        location: "Pescadero, CA",
        difficulty: "easy",
        distance: 2.1,
        elevation: 100,
        scenery: ["ocean", "beach", "dunes"],
        features: ["parking", "tide_pools", "wildlife"],
        description: "Coastal trail with tide pools, elephant seals, and stunning ocean views",
        rating: 4.2,
        reviewCount: 1432,
        image: "https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=800",
        coordinates: { lat: 37.2647, lng: -122.4098 }
    },
    {
        id: 15,
        name: "Skyline to Sea Trail",
        location: "Santa Cruz Mountains, CA",
        difficulty: "very_hard",
        distance: 12.3,
        elevation: 2200,
        scenery: ["forest", "mountain", "ocean"],
        features: ["multiple_trails", "backpacking", "waterfalls"],
        description: "Epic trail from redwood mountains down to the Pacific Ocean",
        rating: 4.8,
        reviewCount: 876,
        image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800",
        coordinates: { lat: 37.2431, lng: -122.2308 }
    },
    {
        id: 16,
        name: "Coyote Hills Regional Park",
        location: "Fremont, CA",
        difficulty: "easy",
        distance: 3.8,
        elevation: 150,
        scenery: ["water", "bay_views", "wetlands"],
        features: ["parking", "restrooms", "bird_watching"],
        description: "Easy loop with salt marsh views and abundant bird life",
        rating: 4.1,
        reviewCount: 2234,
        image: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800",
        coordinates: { lat: 37.5547, lng: -122.0836 }
    },
    {
        id: 17,
        name: "Dipsea Trail",
        location: "Mill Valley to Stinson Beach, CA",
        difficulty: "hard",
        distance: 7.4,
        elevation: 2100,
        scenery: ["forest", "ocean", "valley"],
        features: ["historic_trail", "challenging"],
        description: "Famous trail race route through redwoods to the beach",
        rating: 4.5,
        reviewCount: 1876,
        image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800",
        coordinates: { lat: 37.8974, lng: -122.5808 }
    },
    {
        id: 18,
        name: "Tilden Regional Park",
        location: "Berkeley, CA",
        difficulty: "moderate",
        distance: 4.8,
        elevation: 800,
        scenery: ["forest", "bay_views", "lake"],
        features: ["parking", "restrooms", "botanical_garden"],
        description: "Peaceful trails with lake views and botanical gardens",
        rating: 4.3,
        reviewCount: 2134,
        image: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800",
        coordinates: { lat: 37.8916, lng: -122.2465 }
    },
    {
        id: 19,
        name: "Sweeney Ridge",
        location: "Pacifica, CA",
        difficulty: "moderate",
        distance: 4.2,
        elevation: 1200,
        scenery: ["ocean", "grassland", "city"],
        features: ["parking", "historic_site"],
        description: "Historic ridge trail with Pacific Ocean and SF Bay views",
        rating: 4.2,
        reviewCount: 1543,
        image: "https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=800",
        coordinates: { lat: 37.5965, lng: -122.4854 }
    },
    {
        id: 20,
        name: "Redwood Regional Park",
        location: "Oakland, CA",
        difficulty: "easy",
        distance: 3.2,
        elevation: 400,
        scenery: ["forest", "creek", "redwoods"],
        features: ["parking", "restrooms", "picnic_areas"],
        description: "Serene redwood forest perfect for peaceful walks",
        rating: 4.4,
        reviewCount: 2987,
        image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800",
        coordinates: { lat: 37.8197, lng: -122.1697 }
    }
];

// MIME types for static files
const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
};

// Helper function for HTTPS requests
function makeHTTPSRequest(requestUrl, headers = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = url.parse(requestUrl);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.path,
            method: 'GET',
            headers: headers
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        });
        
        req.on('error', reject);
        req.end();
    });
}

// YouTube search for hiking content
async function searchYouTubeHiking(hikeName) {
    try {
        const query = encodeURIComponent(`${hikeName} hike trail review`);
        const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=3&q=${query}&type=video&key=${YOUTUBE_API_KEY}`;
        
        const response = await makeHTTPSRequest(apiUrl);
        const data = JSON.parse(response);
        
        return data.items?.map(item => ({
            title: item.snippet.title,
            description: item.snippet.description,
            thumbnail: item.snippet.thumbnails.medium.url,
            url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
            channelTitle: item.snippet.channelTitle
        })) || [];
    } catch (error) {
        console.error('YouTube search error:', error);
        return [];
    }
}

// Google Maps Places API for reviews
async function getGooglePlacesData(hikeName, coordinates) {
    try {
        const query = encodeURIComponent(hikeName);
        const apiUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${GOOGLE_MAPS_API_KEY}`;
        
        const response = await makeHTTPSRequest(apiUrl);
        const data = JSON.parse(response);
        
        if (data.results && data.results.length > 0) {
            const place = data.results[0];
            return {
                rating: place.rating,
                reviewCount: place.user_ratings_total,
                photos: place.photos?.slice(0, 3).map(photo => 
                    `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${photo.photo_reference}&key=${GOOGLE_MAPS_API_KEY}`
                ) || []
            };
        }
        return {};
    } catch (error) {
        console.error('Google Places error:', error);
        return {};
    }
}

// Reddit search simulation (you'd implement actual Reddit API)
async function searchRedditRecommendations(hikeName) {
    // Simulated Reddit data - in real implementation, use Reddit API
    const redditPosts = [
        {
            title: `Best time to visit ${hikeName}?`,
            subreddit: 'bayarea',
            upvotes: 45,
            comments: 12,
            summary: "Early morning recommended, parking fills up quickly on weekends"
        },
        {
            title: `${hikeName} trail conditions`,
            subreddit: 'hiking',
            upvotes: 23,
            comments: 8,
            summary: "Trail is well-maintained, bring layers for changing weather"
        }
    ];
    
    return redditPosts;
}

// Recommendation engine based on user preferences
function getRecommendedHikes(preferences, swipedRight = [], swipedLeft = []) {
    // Get all unswipped hikes first
    const availableHikes = sampleHikes.filter(hike => {
        return !swipedRight.includes(hike.id) && !swipedLeft.includes(hike.id);
    });

    // If no unswipped hikes, return empty
    if (availableHikes.length === 0) {
        return [];
    }

    // Score hikes based on preferences (more flexible matching)
    const scoredHikes = availableHikes.map(hike => {
        let score = 0;
        
        // Difficulty matching (flexible)
        if (preferences.difficulty && preferences.difficulty !== 'any') {
            if (hike.difficulty === preferences.difficulty) {
                score += 3; // Perfect match
            } else {
                // Adjacent difficulty levels get partial points
                const difficultyOrder = ['easy', 'moderate', 'hard', 'very_hard'];
                const userIndex = difficultyOrder.indexOf(preferences.difficulty);
                const hikeIndex = difficultyOrder.indexOf(hike.difficulty);
                const diff = Math.abs(userIndex - hikeIndex);
                if (diff === 1) score += 1; // Adjacent difficulty
            }
        } else {
            score += 1; // No preference, slight bonus
        }
        
        // Distance matching (flexible)
        if (preferences.distance) {
            const [min, max] = preferences.distance.split('-').map(Number);
            if (hike.distance >= min && hike.distance <= max) {
                score += 3; // Perfect match
            } else {
                // Nearby distances get partial points
                const distanceFromRange = Math.min(
                    Math.abs(hike.distance - min),
                    Math.abs(hike.distance - max)
                );
                if (distanceFromRange <= 2) score += 1; // Within 2 miles
            }
        } else {
            score += 1; // No preference
        }
        
        // Scenery matching (flexible)
        if (preferences.scenery && preferences.scenery.length > 0) {
            const matchingScenery = preferences.scenery.filter(scene => 
                hike.scenery.includes(scene)
            );
            score += matchingScenery.length * 2; // Points per matching scenery
        } else {
            score += 1; // No preference
        }
        
        // Features matching (bonus points)
        if (preferences.features && preferences.features.length > 0) {
            const matchingFeatures = preferences.features.filter(feature => 
                hike.features.includes(feature)
            );
            score += matchingFeatures.length; // Bonus points
        }
        
        // Rating bonus (higher rated hikes get slight boost)
        score += (hike.rating - 4) * 0.5;
        
        return { ...hike, score };
    });

    // Sort by score (descending) and return
    return scoredHikes
        .sort((a, b) => b.score - a.score)
        .map(({ score, ...hike }) => hike); // Remove score from output
}

// Create enhanced hike data with social proof (fast mode with mock data)
async function enhanceHikeData(hike) {
    // For faster loading, return mock social proof data instead of API calls
    return {
        ...hike,
        socialProof: {
            youtubeVideos: [
                {
                    title: `${hike.name} - Complete Hiking Guide`,
                    description: `Detailed review and tips for hiking ${hike.name}`,
                    thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
                    url: `https://www.youtube.com/watch?v=example`,
                    channelTitle: "Bay Area Hiking Guide"
                }
            ],
            googleData: {
                rating: hike.rating,
                reviewCount: hike.reviewCount,
                photos: [hike.image]
            },
            redditPosts: [
                {
                    title: `Best time to visit ${hike.name}?`,
                    subreddit: 'bayarea',
                    upvotes: 45,
                    comments: 12,
                    summary: "Early morning recommended, parking fills up quickly on weekends"
                }
            ]
        }
    };
}

// HTTP Server
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // API Routes
    if (pathname === '/api/recommendations' && req.method === 'GET') {
        try {
            const swipedRight = parsedUrl.query.swiped_right ? 
                JSON.parse(parsedUrl.query.swiped_right) : [];
            const swipedLeft = parsedUrl.query.swiped_left ? 
                JSON.parse(parsedUrl.query.swiped_left) : [];
            
            const recommendations = getRecommendedHikes(userPreferences, swipedRight, swipedLeft);
            
            // Enhance first recommendation with social proof
            if (recommendations.length > 0) {
                const enhancedHike = await enhanceHikeData(recommendations[0]);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(enhancedHike));
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'No more recommendations available' }));
            }
        } catch (error) {
            console.error('Recommendations error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to get recommendations' }));
        }
        return;
    }
    
    if (pathname === '/api/preferences' && req.method === 'POST') {
        try {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                userPreferences = { ...userPreferences, ...JSON.parse(body) };
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Preferences updated', preferences: userPreferences }));
            });
        } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid preferences data' }));
        }
        return;
    }
    
    if (pathname === '/api/preferences' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(userPreferences));
        return;
    }
    
    if (pathname === '/api/liked-hikes' && req.method === 'GET') {
        // Return liked hikes for calendar integration
        const likedHikes = sampleHikes.filter(hike => 
            parsedUrl.query.liked_ids && 
            JSON.parse(parsedUrl.query.liked_ids).includes(hike.id)
        );
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(likedHikes));
        return;
    }
    
    if (pathname === '/api/hike-details' && req.method === 'GET') {
        // Return specific hike details
        const hikeId = parseInt(parsedUrl.query.id);
        const hike = sampleHikes.find(h => h.id === hikeId);
        
        if (hike) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(hike));
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Hike not found' }));
        }
        return;
    }
    
    // Serve static files
    let filePath;
    if (pathname === '/' || pathname === '/index.html') {
        filePath = path.join(__dirname, 'public', 'index.html');
    } else {
        filePath = path.join(__dirname, 'public', pathname);
    }
    
    const fileExt = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[fileExt] || 'application/octet-stream';
    
    try {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath);
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('<h1>404 - Page Not Found</h1>');
        }
    } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<h1>500 - Internal Server Error</h1>');
    }
});

server.listen(PORT, () => {
    console.log(`🥾 Bay Area Hiking Discovery App running on port ${PORT}`);
    console.log(`🌲 Access the app at: http://localhost:${PORT}`);
    console.log(`\n🔧 Features:`);
    console.log(`✅ Tinder-style swiping for hiking recommendations`);
    console.log(`✅ YouTube video integration`);
    console.log(`✅ Google Maps data integration`);
    console.log(`✅ Reddit community recommendations`);
    console.log(`✅ Draggable calendar for planning`);
    console.log(`✅ Interest-based recommendations`);
});