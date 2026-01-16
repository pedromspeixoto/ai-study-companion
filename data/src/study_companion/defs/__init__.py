from dagster import Definitions, load_assets_from_modules

from study_companion.defs import asset_checks, assets, resources

# Load all assets from the assets module
all_assets = load_assets_from_modules([assets])

# Load asset checks - they're automatically discovered from the module
from study_companion.defs.asset_checks import (
    check_embedding_data_structure,
    check_extracted_text_structure,
    check_pdf_info_structure,
)

all_checks = [
    check_pdf_info_structure,
    check_extracted_text_structure,
    check_embedding_data_structure,
]

defs = Definitions(
    assets=all_assets,
    asset_checks=all_checks,
    resources={
        "postgres": resources.get_postgres_resource(),
        "openai_resource": resources.get_openai_resource(),
    },
)
