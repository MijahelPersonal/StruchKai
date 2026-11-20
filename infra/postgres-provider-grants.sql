-- Apply as owner after 0002. The runtime role cannot migrate or delete catalog data.
GRANT SELECT, INSERT, UPDATE ON providers, provider_policies, provider_mappings, provider_releases,
  anime, anime_episodes, manga, manga_chapters, genres TO struchkai_app;
GRANT SELECT, INSERT ON anime_genres, manga_genres TO struchkai_app;
