from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from backend.store import EntryStore

def register_plugin(app: FastAPI):
    @app.get("/plugin/csv-export")
    def export_csv():
        """
        Dynamically registered CSV export helper plugin.
        """
        store = EntryStore()
        entries = store.export_all_entries()
        
        csv_lines = ["id,bucket,title,tags,status,timestamp"]
        for entry in entries:
            # Clean elements for safe csv formats
            title = entry.get('title', '').replace('"', '""')
            tags = entry.get('tags', '').replace('"', '""')
            csv_lines.append(f'"{entry.get("id")}","{entry.get("bucket")}","{title}","{tags}","{entry.get("status")}","{entry.get("timestamp")}"')
            
        csv_data = "\n".join(csv_lines)
        return PlainTextResponse(
            content=csv_data,
            headers={
                "Content-Disposition": "attachment; filename=memoryvault-export.csv"
            }
        )
