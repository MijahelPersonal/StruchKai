-- Ejecutar en la base de StruchKai como propietario tras migrar.
GRANT SELECT, INSERT, UPDATE ON users, user_profiles, user_sessions TO struchkai_app;
GRANT SELECT ON user_roles, roles TO struchkai_app;
GRANT INSERT ON audit_logs TO struchkai_app;
