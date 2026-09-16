"use client";
import { useLibrary } from "@/components/library-provider";
import { useEffect, useState } from "react";
import { recoveryFiles, removeRecoveryFile } from "@/lib/storage/local/assets";
import { storageEvents } from "@/lib/storage";
import { downloadBlob } from "@/lib/utils/download";
import { Button } from "@/components/ui/button";
export function FileRecovery() {
  const { user } = useLibrary();
  const [files, setFiles] = useState<Awaited<ReturnType<typeof recoveryFiles>>>([]);
  useEffect(() => {
    if (!user) return;
    let live = true;
    const refresh = () => {
      void recoveryFiles().then((value) => {
        if (live) setFiles(value);
      });
    };
    refresh();
    const stop = storageEvents.subscribe(refresh);
    return () => {
      live = false;
      stop();
    };
  }, [user]);
  if (!files.length) return null;
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h3 className="font-medium">Files preserved from another edit</h3>
      <p className="text-sm text-muted-foreground">
        Another device replaced these versions. Save a recovery copy before removing them from this
        device.
      </p>
      {files.map((file) => (
        <div key={file.id} className="flex flex-wrap items-center gap-2">
          <span className="text-sm">{file.title}</span>
          <Button size="sm" variant="outline" onClick={() => downloadBlob(file.blob, file.name)}>
            Save recovery copy
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              if (
                window.confirm(
                  "Remove this preserved copy from this device? Save it first if you still need it.",
                )
              ) {
                await removeRecoveryFile(file.id);
                setFiles(await recoveryFiles());
              }
            }}
          >
            Remove preserved copy
          </Button>
        </div>
      ))}
    </section>
  );
}
