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
    "version": "2.0.0",
    "pkgPath": "anime/src/en/kuudere.js"
  }
];

// Authors: - Adapted for Kuudere.to using the AnymeX Special #1 template

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.client = new Client();
    this.preferenceSourceMenu = "Kuudere";
  }

  // Required headers to mimic a browser and avoid being blocked
  getHeaders(url) {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
      Referer: this.source.baseUrl,
    };
  }

  // Helper to get user preferences
  getPreference(key) {
    return parseInt(new SharedPreferences().get(`${this.preferenceSourceMenu}:${key}`));
  }

  // Helper function to make GET requests and return text
  async requestText(slug) {
    const url = `${this.source.baseUrl}${slug}`;
    console.log(`Requesting URL: ${url}`);
    const res = await this.client.get(url, this.getHeaders(url));
    return res.body;
  }

  // Helper function to parse HTML from a request
  async request(slug) {
    return new Document(await this.requestText(slug));
  }

  // --- Main Content Fetching Functions ---

  async getPopular(page) {
    const slug = page > 1 ? `/?page=${page}` : "/";
    const body = await this.request(slug);
    const list = this.parseListItems(body);
    return { list, hasNextPage: list.length > 0 };
  }

  get supportsLatest() {
    return true; // The site has a "Latest Episodes" section
  }

  async getLatestUpdates(page) {
    // For kuudere.to, the latest updates are on the same page as the popular anime.
    return await this.getPopular(page);
  }

  async search(query, page, filters) {
    const slug = `/search?keyword=${encodeURIComponent(query)}&page=${page}`;
    const body = await this.request(slug);
    const list = this.parseListItems(body);
    return { list, hasNextPage: list.length > 0 };
  }

  // --- Detail and Video Parsing ---

  async getDetail(url) {
    const body = await this.request(url);

    const title = body.selectFirst("h1.title")?.text.trim();
    const imageUrl = body.selectFirst("div.anime_detail_body div.img img")?.getSrc;
    const description = body.selectFirst("div.description")?.text.trim();

    let status = 5; // Default to unknown
    const genre = [];
    const metaItems = body.select("div.anime_info_body_bg p.type");
    for (const item of metaItems) {
        const text = item.text.trim();
        if (text.toLowerCase().startsWith("status:")) {
            if (text.toLowerCase().includes("ongoing")) status = 0;
            else if (text.toLowerCase().includes("completed")) status = 1;
        } else if (text.toLowerCase().startsWith("genre:")) {
            const genreText = item.selectFirst("a")?.text || text.replace("Genre:", "").trim();
            if (genreText) genre.push(...genreText.split(',').map(g => g.trim()));
        }
    }

    const chapters = [];
    const episodeItems = body.select("#episode_page li a");
    for (const ep of episodeItems) {
      const name = ep.text.trim();
      const epUrl = ep.getHref;
      if (name && epUrl) {
        chapters.push({ name, url: epUrl });
      }
    }

    return { description, status, genre: genre.join(", "), chapters, link: url };
  }

  async getVideoList(url) {
    const streams = [];
    const pageHtml = await this.requestText(url);

    // The site stores server info in a JavaScript variable `ajax_player`
    const ajaxPlayerMatch = pageHtml.match(/var ajax_player = ({[\s\S]*?});/);
    if (!ajaxPlayerMatch || !ajaxPlayerMatch[1]) {
      console.error("Could not find ajax_player variable.");
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

    const serverList = Object.keys(serverData)
      .map(key => ({ id: key, ...serverData[key] }))
      .sort((a, b) => {
        if (parseInt(a.id) === preferredServer) return -1;
        if (parseInt(b.id) === preferredServer) return 1;
        return 0;
      });

    for (const server of serverList) {
      if (!server.embed) continue;

      try {
        const embedPageHtml = await this.requestText(server.embed);
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

  // --- Helper Functions and Preferences ---

  // Helper to parse items from a list page (homepage, search, etc.)
  parseListItems(body) {
    const items = body.select("div.last_episodes > div.item");
    console.log(`Found ${items.length} items on the page.`);
    const list = [];
    for (const item of items) {
      const linkElement = item.selectFirst("a");
      const name = item.selectFirst("p.name")?.text.trim();
      const imageUrl = item.selectFirst("div.img img")?.getSrc;
      const link = linkElement?.getHref;

      if (name && link) {
        list.push({ name, imageUrl, link });
      }
    }
    return list;
  }

  // Define user-configurable preferences for this source
  getSourcePreferences() {
    return [
      {
        key: "preferred_server",
        listPreference: {
          title: "Preferred Streaming Server",
          summary: "Select your preferred video server. It will be tried first.",
          valueIndex: 0,
          entries: ["Server 1", "Server 2", "Server 3"],
          entryValues: ["1", "2", "3"],
        },
      },
    ];
  }

  // --- Unused but required functions ---

  // For novel html content
  async getHtmlContent(url) {
    throw new Error("getHtmlContent not implemented");
  }

  // Clean html up for reader
  async cleanHtmlContent(html) {
    throw new Error("cleanHtmlContent not implemented");
  }

  // For manga chapter pages
  async getPageList(url) {
    throw new Error("getPageList not implemented");
  }

  getFilterList() {
    throw new Error("getFilterList not implemented");
  }
}
