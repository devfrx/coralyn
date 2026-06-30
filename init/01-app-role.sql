CREATE ROLE coralyn_app WITH LOGIN PASSWORD 'coralyn_app' NOSUPERUSER NOBYPASSRLS CREATEDB;

GRANT ALL ON DATABASE coralyn_dev TO coralyn_app;
ALTER SCHEMA public OWNER TO coralyn_app;

CREATE DATABASE coralyn_test OWNER coralyn_app;
\connect coralyn_test
ALTER SCHEMA public OWNER TO coralyn_app;
