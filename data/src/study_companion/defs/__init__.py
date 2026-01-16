from dagster import Definitions, load_assets_from_modules

from study_companion.defs import assets, resources

# Load all assets from the assets module
all_assets = load_assets_from_modules([assets])

defs = Definitions(
    assets=all_assets,
    resources={
        "postgres": resources.get_postgres_resource(),
        "openai_resource": resources.get_openai_resource(),
    },
)
