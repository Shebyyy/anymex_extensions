const mangayomiSources = [
{
  "name": "AniHQ",
  "lang": "en",
  "id": 209614034,
  "baseUrl": "https://anihq.to",
  "apiUrl": "",
  "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=anihq.to",
  "typeSource": "single",
  "itemType": 1,
  "version": "1.0.0",
  "pkgPath": "anime/src/en/anihq.js"
}
  ];
// Authors: - Adapted for AniHQ

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.client = new Client();
    this.preferenceSourceMenu = "AniHQ";
  }

  getHeaders(url) {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
      Referer: this.source.baseUrl,
      "X-Requested-With": "XMLHttpRequest",
    };
  }

  getPreference(key) {
    return parseInt(new SharedPreferences().get(`${this.preferenceSourceMenu}:${key}`));
  }

  async requestText(slug) {
    const url = `${this.source.baseUrl}${slug}`;
    console.log(`Requesting URL: ${url}`);
    const res = await this.client.get(url, this.getHeaders(url));
    return res.body;
  }

  async request(slug) {
    return new Document(await this.requestText(slug));
  }

  // --- List Parsing Functions (Popular, Latest, Search) ---

  parseListItems(body) {
    const items = body.select("div.film_list-wrap > div.flw-item");
    console.log(`Found ${items.length} items on the page.`);
    const list = [];
    for (const item of items) {
      const linkElement = item.selectFirst("h3.film-name > a");
      const name = linkElement?.text.trim();
      const imageUrl = item.selectFirst("div.film-poster > img")?.getSrc;
      const link = linkElement?.getHref;

      if (name && link) {
        list.push({ name, imageUrl, link });
      }
    }
    return list;
  }

  async getPopular(page) {
    const slug = page > 1 ? `/home?page=${page}` : "/";
    const body = await this.request(slug);
    const list = this.parseListItems(body);
    return { list, hasNextPage: list.length > 0 };
  }

  get supportsLatest() {
    return true;
  }

  async getLatestUpdates(page) {
    // The homepage contains the latest episodes.
    return await this.getPopular(page);
  }

  async search(query, page, filters) {
    const slug = `/search?keyword=${encodeURIComponent(query)}&page=${page}`;
    const body = await this.request(slug);
    const list = this.parseListItems(body);
    return { list, hasNextPage: list.length > 0 };
  }

  // --- Detail Page Parsing ---

  async getDetail(url) {
    const body = await this.request(url);
    const detailContainer = body.selectFirst("div.anis-detail");

    const title = detailContainer.selectFirst("h2.heading-name")?.text.trim();
    const imageUrl = detailContainer.selectFirst("div.film-poster img")?.getSrc;
    const description = detailContainer.selectFirst("div.description")?.text.trim();

    let status = 5; // Default to unknown
    const genre = [];
    const metaItems = detailContainer.select("div.anis-info > div.item-list");
    for (const item of metaItems) {
      const text = item.text.trim();
      if (text.startsWith("Status:")) {
        if (text.includes("Ongoing")) status = 0;
        else if (text.includes("Completed")) status = 1;
      } else if (text.startsWith("Genre:")) {
        const genreElements = item.select("a");
        genreElements.forEach(el => genre.push(el.text.trim()));
      }
    }

    // --- Episode List (requires an AJAX call) ---
    const animeId = detailContainer.getAttr("data-id");
    if (!animeId) throw new Error("Could not find anime ID.");

    const episodeApiUrl = `/ajax/v2/episode/list/${animeId}`;
    const episodeRes = await this.client.get(this.source.baseUrl + episodeApiUrl, this.getHeaders(episodeApiUrl));
    const episodeData = JSON.parse(episodeRes.body);

    const chapters = [];
    if (episodeData.html) {
      const episodeBody = new Document(episodeData.html);
      const subItems = episodeBody.select("#episode-sv > .item");
      const dubItems = episodeBody.select("#episode-dv > .item");

      const processEpisodes = (items, type) => {
        const epList = [];
        for (const item of items) {
          const linkElement = item.selectFirst("a");
          const name = linkElement?.text.trim();
          const epUrl = linkElement?.getHref;
          if (name && epUrl) {
            epList.push({ name: `${name} (${type})`, url: epUrl });
          }
        }
        return epList;
      };

      chapters.push(...processEpisodes(subItems, "Sub"));
      chapters.push(...processEpisodes(dubItems, "Dub"));
    }

    return { description, status, genre: genre.join(", "), chapters: chapters.reverse(), link: url };
  }

  // --- Video Stream Extraction (requires multiple AJAX calls) ---

  async getVideoList(url) {
    const streams = [];
    const body = await this.request(url);
    const watchArea = body.selectFirst("div.watch-area");

    const episodeId = watchArea.getAttr("data-id");
    if (!episodeId) throw new Error("Could not find episode ID.");

    // 1. Get list of available servers for the episode
    const serverApiUrl = `/ajax/episode/servers?episodeId=${episodeId}`;
    const serverRes = await this.client.get(this.source.baseUrl + serverApiUrl, this.getHeaders(serverApiUrl));
    const serverData = JSON.parse(serverRes.body);

    if (!serverData.html) return streams;

    const serverBody = new Document(serverData.html);
    const serverLinks = serverBody.select("div.server-item > a[data-id]");

    const preferredServer = this.getPreference("preferred_server");

    for (const serverLink of serverLinks) {
      const serverId = serverLink.getAttr("data-id");
      const serverName = serverLink.text.trim();

      if (preferredServer !== 0 && parseInt(serverId) !== preferredServer) {
        continue;
      }

      // 2. Get the embed link for the selected server
      const embedApiUrl = `/ajax/episode/sources?id=${serverId}`;
      const embedRes = await this.client.get(this.source.baseUrl + embedApiUrl, this.getHeaders(embedApiUrl));
      const embedData = JSON.parse(embedRes.body);

      if (!embedData.link) continue;

      // 3. Fetch the embed page to find the final video URL
      try {
        const embedPageHtml = await this.requestText(embedData.link);
        // The video URL is often in a script tag within the embed page
        const videoUrlMatch = embedPageHtml.match(/file:\s*["']([^"']+)["']/);
        if (videoUrlMatch && videoUrlMatch[1]) {
          const videoUrl = videoUrlMatch[1];
          streams.push({
            url: videoUrl,
            originalUrl: videoUrl,
            quality: serverName,
            headers: this.getHeaders(embedData.link),
          });
        }
      } catch (error) {
        console.error(`Failed to extract stream from server ${serverName}:`, error);
      }
    }
    
    return streams;
  }

  // --- User Preferences ---

  getSourcePreferences() {
    return [
      {
        key: "preferred_server",
        listPreference: {
          title: "Preferred Streaming Server",
          summary: "Select your preferred video server. It will be tried first.",
          valueIndex: 0, // Default to 'Auto'
          entries: ["Auto", "Vidstream", "MyCloud"],
          entryValues: ["0", "1", "4"],
        },
      },
    ];
  }
}
