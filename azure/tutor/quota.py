import hashlib
import os
from datetime import datetime, timezone

from azure.core import MatchConditions
from azure.core.exceptions import ResourceExistsError, ResourceModifiedError, ResourceNotFoundError
from azure.data.tables import TableClient, TableTransactionError, UpdateMode
from azure.identity import DefaultAzureCredential

from vakya_companion.engine import ProviderError


class DailyQuota:
    def __init__(self):
        self.table = TableClient(
            endpoint=os.environ["AZURE_STORAGE_TABLE_ENDPOINT"],
            table_name=os.environ.get("VAKYA_QUOTA_TABLE", "VakyaTutorQuota"),
            credential=DefaultAzureCredential(),
        )
        try:
            self.table.create_table()
        except ResourceExistsError:
            pass
        self.global_limit = int(os.environ.get("VAKYA_GLOBAL_DAILY_LIMIT", "100"))
        self.client_limit = int(os.environ.get("VAKYA_CLIENT_DAILY_LIMIT", "20"))
        if min(self.global_limit, self.client_limit) < 1:
            raise ValueError("Quota limits must be positive.")

    def take(self, client):
        day = datetime.now(timezone.utc).date().isoformat()
        identity = hashlib.sha256((day + client).encode()).hexdigest()
        for attempt in range(3):
            actions = []
            for key, limit in (("global", self.global_limit), (identity, self.client_limit)):
                try:
                    entity = self.table.get_entity(day, key)
                except ResourceNotFoundError:
                    actions.append(("create", {"PartitionKey": day, "RowKey": key, "count": 1}))
                else:
                    if int(entity["count"]) >= limit:
                        raise ProviderError("quota_exceeded", "Daily request limit reached. Try again tomorrow.")
                    updated = {"PartitionKey": day, "RowKey": key, "count": int(entity["count"]) + 1}
                    actions.append(("update", updated, {
                        "mode": UpdateMode.REPLACE, "etag": entity.metadata["etag"],
                        "match_condition": MatchConditions.IfNotModified,
                    }))
            try:
                self.table.submit_transaction(actions)
                return
            except (ResourceExistsError, ResourceModifiedError, TableTransactionError) as error:
                if getattr(error, "status_code", None) not in (409, 412):
                    raise
        raise ProviderError("busy", "Quota reservation is busy; retry shortly.")
