const mangayomiSources = [
  {
    "name": "Anihq",
    "lang": "en",
    "id": 832952401,
    "baseUrl": "https://anihq.to/",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=https://anihq.to//",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.0.3",
    "pkgPath": "anime/src/en/anihq.js"
  }
];

// Authors: - Swakshan

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.client = new Client();
  }

  getHeaders(url) {
    return {
      Referer: this.source.baseUrl,
      Origin: this.source.baseUrl,
    };
  }

  getPreference(key) {
    return parseInt(new SharedPreferences().get(key));
  }

  async requestText(slug) {
    var url = `${this.source.baseUrl}${slug}`;
    var res = await this.client.get(url, this.getHeaders());
    return res.body;
  }

  async request(slug) {
    return new Document(await this.requestText(slug));
  }

  async fetchPopularnLatest(slug) {
    var body = await this.request(slug);
    var items = body.select("div.item");
    var list = [];
    var hasNextPage = true;
    if (items.length > 0) {
      for (var item of items) {
        var imageUrl = item.selectFirst("img").getSrc;
        var linkSection = item.selectFirst("a");
        var link = linkSection.getHref;
        var name = linkSection.text;
        list.push({
          name,
          imageUrl,
          link,
        });
      }
    } else {
      hasNextPage = false;
    }
    return { list, hasNextPage };
  }

  async getPopular(page) {
    var start = (page - 1) * 25;
    var limit = start + 25;
    var slug = `/filter?sort=trending&page=${page}`;
    return await this.fetchPopularnLatest(slug);
  }

  get supportsLatest() {
    return true;
  }

  async getLatestUpdates(page) {
    var slug = `/filter?sort=latest&page=${page}`;
    return await this.fetchPopularnLatest(slug);
  }

  async search(query, page, filters) {
    var slug = `/search?keyword=${encodeURIComponent(query)}&page=${page}`;
    var body = await this.request(slug);
    var items = body.select("div.item");
    var list = [];
    for (var item of items) {
      var imageUrl = item.selectFirst("img").getSrc;
      var link = item.selectFirst("a").getHref;
      var name = item.selectFirst("h2").text;
      list.push({
        name,
        imageUrl,
        link,
      });
    }

    return { list, hasNextPage: false };
  }

  statusCode(status) {
    return (
      {
        Ongoing: 0,
        Completed: 1,
      }[status] ?? 5
    );
  }

  async getDetail(url) {
    var baseUrl = this.source.baseUrl;
    var slug = url.replace(baseUrl, "");
    var link = baseUrl + slug;

    var body = await this.request(slug);

    var media = body.selectFirst(".media");
    var title = media.selectFirst("h1").text;
    var spans = media.selectFirst("p.info").select("span");
    var statusText = spans[spans.length - 1].text.replace("Status: ", "");
    var status = this.statusCode(statusText);

    var tagscat = media.select(".tagscat > li");
    var genre = [];
    tagscat.forEach((tag) => genre.push(tag.text));
    var description = body.selectFirst("p.description").text;
    var chapters = [];

    var episodesList = body.select(".episodes > li");
    episodesList.forEach((ep) => {
      var epTitle = ep.selectFirst("span.ep-title").text;
      var epNumber = ep.selectFirst("strong").text.replace(title, "Episode");
      var epName = epNumber == epTitle ? epNumber : `${epNumber} - ${epTitle}`;
      var epUrl = ep.selectFirst("a").getHref;

      var scanlator = "";
      chapters.push({ name: epName, url: epUrl, scanlator });
    });

    return { description, status, genre, chapters, link };
  }

  async exxtractStreams(div, audio) {
    var slug = div.selectFirst("iframe").getSrc;
    var streams = [];
    if (slug.length < 1) {
      return streams;
    }
    var body = await this.requestText(slug);
    var sKey = "var videoSources = ";
    var eKey = "var httpProtocol";
    var start = body.indexOf(sKey) + sKey.length;
    var end = body.indexOf(eKey) - 8;
    var videoSourcesStr = body.substring(start, end);
    let videoSources = eval("(" + videoSourcesStr + ")");
    var headers = this.getHeaders();
    videoSources.forEach((videoSource) => {
      var url = this.source.baseUrl + videoSource.file;
      var quality = `${videoSource.label} - ${audio}`;

      streams.push({
        url,
        originalUrl: url,
        quality,
        headers,
      });
    });
    return streams.reverse();
  }

  async getVideoList(url) {
    var body = await this.request(url);

    var sub = body.selectFirst("#subbed");
    var subStreams = await this.exxtractStreams(sub, "Sub");

    var dub = body.selectFirst("#dubbed");
    var dubStreams = await this.exxtractStreams(dub, "Dub");

    var pref = this.getPreference("stream_type_1");
    var streams = [];
    if (pref == 0) {
      streams = [...subStreams, ...dubStreams];
    } else {
      streams = [...dubStreams, ...subStreams];
    }

    return streams;
  }

  getSourcePreferences() {
    return [
      {
        key: "stream_type_1",
        listPreference: {
          title: "Preferred stream type",
          summary: "",
          valueIndex: 0,
          entries: ["Sub", "Dub"],
          entryValues: ["0", "1"],
        },
      },
    ];
  }
}