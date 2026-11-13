-- Ejecutar como propietario de struchkai_db. Crear antes un rol LOGIN struchkai_app.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CONNECT, TEMP ON DATABASE struchkai_db FROM PUBLIC;
GRANT CONNECT ON DATABASE struchkai_db TO struchkai_app;
GRANT USAGE ON SCHEMA public TO struchkai_app;
GRANT SELECT ON anime, anime_episodes, manga, manga_chapters, genres, anime_genres, manga_genres, user_profiles TO struchkai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON library_entries TO struchkai_app;
GRANT SELECT, INSERT, DELETE ON user_favorites TO struchkai_app;
