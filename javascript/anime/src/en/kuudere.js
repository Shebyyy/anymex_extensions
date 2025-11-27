const mangayomiSources = [
{
  "name": "Kuudere",
  "lang": "en",
  "id": 209614033,
  "baseUrl": "https://kuudere.to",
  "apiUrl": "",
  "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=https://kuudere.to",
  "typeSource": "single",
  "itemType": 1,
  "version": "1.0.0",
  "pkgPath": "anime/src/en/kuudere.js"
}
  // ... other sources
];

// Authors: - Adapted for Kuudere by AI

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.client = new Client();
    this.preferenceSourceMenu = "Kuudere"; // For SharedPreferences
  }

  getHeaders(url) {
    return {
      Referer: this.source.baseUrl,
      "X-Requested-With": "XMLHttpRequest", // Some sites check for this
    };
  }

  // Helper to get user preferences
  getPreference(key) {
    return parseInt(new SharedPreferences().get(`${this.preferenceSourceMenu}:${key}`));
  }

  async requestText(slug) {
    const url = `${this.source.baseUrl}${slug}`;
    const res = await this.client.get(url, this.getHeaders(url));
    return res.body;
  }

  async request(slug) {
    return new Document(await this.requestText(slug));
  }

  // Generic function to parse lists of anime (Popular, Latest, Search)
  parseListItems(body) {
    const items = body.select("div.item");
    const list = [];
    for (const item of items) {
      const linkElement = item.selectFirst("a");
      const name = item.selectFirst("div.name").text.trim();
      const imageUrl = item.selectFirst("div.image img").getSrc;
      const link = linkElement.getHref;

      if (name && link) {
        list.push({ name, imageUrl, link });
      }
    }
    return list;
  }

  async getPopular(page) {
    const slug = page > 1 ? `/?page=${page}` : "/";
    const body = await this.request(slug);
    const list = this.parseListItems(body);
    // Kuudere doesn't provide a clear way to determine the last page, so we assume there's always a next page.
    // The app will stop when it receives an empty list.
    return { list, hasNextPage: list.length > 0 };
  }

  get supportsLatest() {
    return true; // The site has a "Latest Episodes" section
  }

  async getLatestUpdates(page) {
    // The latest updates are on the same page as popular anime.
    // We can reuse the getPopular logic.
    return await this.getPopular(page);
  }

  async search(query, page, filters) {
    const slug = `/search?keyword=${encodeURIComponent(query)}&page=${page}`;
    const body = await this.request(slug);
    const list = this.parseListItems(body);
    return { list, hasNextPage: list.length > 0 };
  }

  async getDetail(url) {
    const body = await this.request(url);

    const title = body.selectFirst("h1.title").text.trim();
    const imageUrl = body.selectFirst("div.poster img").getSrc;
    const description = body.selectFirst("div.description .text").text.trim();

    // Extract status, genre, and other metadata
    let status = 5; // Default to unknown
    const genre = [];
    const metaItems = body.select("div.meta span.item");
    for (const item of metaItems) {
      const text = item.text.trim();
      if (text.toLowerCase().startsWith("status:")) {
        if (text.toLowerCase().includes("ongoing")) status = 0;
        else if (text.toLowerCase().includes("completed")) status = 1;
      } else if (text.toLowerCase().startsWith("type:") || text.toLowerCase().startsWith("studio:")) {
        // Skip these, or add them if needed
      } else {
        genre.push(text);
      }
    }

    // Extract episode list
    const chapters = [];
    const episodeItems = body.select(".listing.items li a");
    for (const ep of episodeItems) {
      const name = ep.text.trim();
      const epUrl = ep.getHref;
      if (name && epUrl) {
        chapters.push({ name, url: epUrl });
      }
    }

    return { description, status, genre: genre.join(", "), chapters, link: url };
  }

  // This is the most critical part. It extracts video URLs from the episode page.
  async getVideoList(url) {
    const streams = [];
    const pageHtml = await this.requestText(url);

    // The site stores server info in a JavaScript variable `ajax_player`
    // We use regex to extract and parse this JSON object.
    const ajaxPlayerMatch = pageHtml.match(/var ajax_player = ({[\s\S]*?});/);
    if (!ajaxPlayerMatch || !ajaxPlayerMatch[1]) {
      return streams;
    }

    let serverData;
    try {
      serverData = JSON.parse(ajaxPlayerMatch[1]);
    } catch (e) {
      console.error("Failed to parse server data JSON:", e);
      return streams;
    }
    
    const preferredServer = this.getPreference("preferred_server");

    // Convert server object to an array and sort based on user preference
    const serverList = Object.keys(serverData)
      .map(key => ({ id: key, ...serverData[key] }))
      .sort((a, b) => {
        // Prioritize the user's preferred server
        if (parseInt(a.id) === preferredServer) return -1;
        if (parseInt(b.id) === preferredServer) return 1;
        return 0;
      });

    for (const server of serverList) {
      if (!server.embed) continue;

      try {
        // Fetch the HTML content of the embed player (e.g., from sbsscloud.com)
        const embedPageHtml = await this.requestText(server.embed);
        
        // The video URL is inside a JavaScript variable, often `file:"URL"`
        // We use regex to find the URL within the quotes.
        const videoUrlMatch = embedPageHtml.match(/file:"([^"]+)"/);
        if (videoUrlMatch && videoUrlMatch[1]) {
          const videoUrl = videoUrlMatch[1];
          const quality = `Server ${server.id}`;
          
          streams.push({
            url: videoUrl,
            originalUrl: videoUrl,
            quality: quality,
            headers: this.getHeaders(videoUrl),
          });
        }
      } catch (error) {
        console.error(`Failed to extract stream from server ${server.id}:`, error);
      }
    }
    
    return streams;
  }

  // Define user-configurable preferences for this source
  getSourcePreferences() {
    return [
      {
        key: "preferred_server",
        listPreference: {
          title: "Preferred Streaming Server",
          summary: "Select your preferred video server. It will be tried first.",
          valueIndex: 0, // Default to the first server
          entries: ["Server 1", "Server 2", "Server 3"], // Add more if available
          entryValues: ["1", "2", "3"],
        },
      },
    ];
  }
}
