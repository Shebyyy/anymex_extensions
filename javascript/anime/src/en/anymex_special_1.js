const mangayomiSources = [{
    "name": "AnymeX Special #1",
    "lang": "en",
    "baseUrl": "https://xprime.tv",
    "apiUrl": "",
    "iconUrl":
      "https://raw.githubusercontent.com/RyanYuuki/AnymeX/main/assets/images/logo.png",
    "typeSource": "single",
    "itemType": 1,
    "version": "0.0.3",
    "pkgPath": "anime/src/en/anymex_special_1.js"
  }];

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.client = new Client();
  }

  getHeaders(url) {
    throw new Error("getHeaders not implemented");
  }

  mapToManga(dataArr, isMovie) {
    var type = isMovie ? "movie" : "tv";
    return dataArr.map((e) => {
      return {
        name: e.title ?? e.name,
        link: `https://themoviedb.hexa.watch/api/tmdb/${type}/${e.id}`,
        imageUrl:
          "https://image.tmdb.org/t/p/w500" +
          (e.poster_path ?? e.backdrop_path),
        description: e.overview,
      };
    });
  }

  async requestSearch(query, isMovie) {
    const type = isMovie ? "movie" : "tv";
    const url = `https://themoviedb.hexa.watch/api/tmdb/search/${type}?language=en-US&query=${encodeURIComponent(
      query
    )}&page=1&include_adult=false`;

    const resp = await this.client.get(url);
    const data = JSON.parse(resp.body);
    return data;
  }

  async getPopular(page) {
    throw new Error("getPopular not implemented");
  }

  get supportsLatest() {
    throw new Error("supportsLatest not implemented");
  }

  async getLatestUpdates(page) {
    throw new Error("getLatestUpdates not implemented");
  }

  async search(query, page = 1, filters) {
    try {
      const cleanedQuery = query.replace(/\bseasons?\b/gi, "").trim();

      const [movieData, seriesData] = await Promise.all([
        this.requestSearch(cleanedQuery, true),
        this.requestSearch(cleanedQuery, false),
      ]);

      const movies = this.mapToManga(movieData.results || [], true);
      const series = this.mapToManga(seriesData.results || [], false);

      const maxLength = Math.max(movies.length, series.length);
      const mixedResults = [];

      for (let i = 0; i < maxLength; i++) {
        if (i < movies.length) mixedResults.push(movies[i]);
        if (i < series.length) mixedResults.push(series[i]);
      }

      return {
        list: mixedResults,
        hasNextPage: false,
      };
    } catch (error) {
      console.error("Search error:", error);
      throw error;
    }
  }

  async getDetail(url) {
    const resp = await this.client.get(url);
    const parsedData = JSON.parse(resp.body);
    const isMovie = url.includes("movie");

    const name = parsedData.name ?? parsedData.title;
    const chapters = [];

    const idMatch = url.match(/(?:movie|tv)\/(\d+)/);
    const tmdbId = idMatch ? idMatch[1] : null;
    const imdbId = parsedData.imdb_id;

    if (!tmdbId) throw new Error("Invalid TMDB ID in URL");

    if (isMovie) {
      const releaseDate = parsedData.release_date;
      chapters.push({
        name: "Movie",
        url: `movie/${name}/${releaseDate.split("-")[0]}/${tmdbId}/${imdbId}`,
      });
    } else {
      const seasons = parsedData.seasons || [];

      for (const season of seasons) {
        if (season.season_number === 0) continue;

        const episodeCount = season.episode_count;

        for (let ep = 1; ep <= episodeCount; ep++) {
          chapters.push({
            name: `S${season.season_number} · E${ep}`,
            url: `tv/${name}/${
              season.air_date.split("-")[0]
            }/${tmdbId}/${imdbId}/${season.season_number}/${ep}`,
          });
        }
      }
    }

    return {
      name,
      chapters: chapters.reverse(),
    };
  }

  // For novel html content
  async getHtmlContent(url) {
    throw new Error("getHtmlContent not implemented");
  }

  // Clean html up for reader
  async cleanHtmlContent(html) {
    throw new Error("cleanHtmlContent not implemented");
  }

  async getVideoList(url) {
    const splitParts = url.split("/");
    const isMovie = url.includes("movie");

    const title = decodeURIComponent(splitParts[1]);
    const releaseDate = splitParts[2];
    const id = splitParts[3];
    const imdbId = splitParts[4];

    let baseUrl = `https://backend.xprime.tv/primebox?name=${encodeURIComponent(
      title
    )}&fallback_year=${releaseDate}&id=${id}&imdb=${imdbId}`;

    if (!isMovie) {
      const season = splitParts[5];
      const episode = splitParts[6];
      baseUrl += `&season=${season}&episode=${episode}`;
    }

    const [primeboxResp, primenetResp, phoenixResp] = await Promise.all([
      this.client.get(baseUrl),
      this.client.get(baseUrl.replace("primebox", "primenet")),
      this.client.get(baseUrl.replace("primebox", "phoenix")),
    ]);

    const result = [];

    try {
      const primeboxData = JSON.parse(primeboxResp.body);
      const primeboxStreams = Object.entries(primeboxData.streams || {}).map(
        ([quality, url]) => ({
          url,
          quality: `Primebox - ${quality}`,
          originalUrl: url,
          subtitles:
            primeboxData.subtitles?.map((sub) => ({
              file: sub.file,
              label: sub.label,
            })) || [],
        })
      );
      result.push(...primeboxStreams);
    } catch (e) {
      console.warn("Failed to parse Primebox response:", e);
    }

    try {
      const primenetData = JSON.parse(primenetResp.body);
      if (primenetData.url) {
        result.push({
          url: primenetData.url,
          headers: {
            Referer: "https://xprime.tv",
            Origin: "https://xprime.tv",
          },
          quality: "Primenet - Auto",
          originalUrl: primenetData.url,
          subtitles: [],
        });
      }
    } catch (e) {
      console.warn("Failed to parse Primenet response:", e);
    }

    try {
      const phoenixData = JSON.parse(phoenixResp.body);
      if (phoenixData.url) {
        result.push({
          url: phoenixData.url,
          headers: {
            Referer: "https://xprime.tv",
            Origin: "https://xprime.tv",
          },
          quality: "Phoenix - Auto",
          originalUrl: phoenixData.url,
          subtitles:
            phoenixData.subs?.length > 0 ? phoenixData.subtitles || [] : [],
        });
      }
    } catch (e) {
      console.warn("Failed to parse Phoenix response:", e);
    }

    return result;
  }

  // For manga chapter pages
  async getPageList(url) {
    throw new Error("getPageList not implemented");
  }

  getFilterList() {
    throw new Error("getFilterList not implemented");
  }

  getSourcePreferences() {
    throw new Error("getSourcePreferences not implemented");
  }
}
