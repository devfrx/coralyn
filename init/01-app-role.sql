CREATE ROLE driftly_app WITH LOGIN PASSWORD 'driftly_app' NOSUPERUSER NOBYPASSRLS CREATEDB;

GRANT ALL ON DATABASE driftly_dev TO driftly_app;
ALTER SCHEMA public OWNER TO driftly_app;

CREATE DATABASE driftly_test OWNER driftly_app;
\connect driftly_test
ALTER SCHEMA public OWNER TO driftly_app;
