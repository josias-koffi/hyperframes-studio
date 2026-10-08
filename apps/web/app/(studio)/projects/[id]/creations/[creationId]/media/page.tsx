import { MicIcon, MusicIcon, VolumeXIcon } from "lucide-react";
import { StepPage } from "@/components/project/step-page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { serverFile } from "@/lib/server-api";
import { parseAudioMeta } from "@/lib/audio-meta";
import { loadCreation } from "@/lib/creation-data";
import { stepReached } from "@/lib/creation-state";

export default async function MediaPage({ params }: PageProps<"/projects/[id]/creations/[creationId]/media">) {
  const { creationId: id } = await params;
  const data = await loadCreation(id);
  const reached = stepReached(data.creation, data.state, "media");
  const tracks = reached ? parseAudioMeta(await serverFile(id, "audio_meta.json")) : null;
  const file = (path: string) => `/api/creations/${id}/files/${path}`;

  return (
    <StepPage data={data} step="media" reached={reached}>
      {!tracks || (!tracks.music && tracks.voices.length === 0) ? (
        <Empty className="border bg-card shadow-surface">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <VolumeXIcon />
            </EmptyMedia>
            <EmptyTitle>Vidéo sans voix ni musique</EmptyTitle>
            <EmptyDescription>Le storyboard n&apos;en demandait pas : l&apos;étape a été sautée.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-6">
          {tracks.music && (
            <Card className="shadow-surface">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MusicIcon className="size-4 text-primary" /> Musique de fond
                </CardTitle>
                {tracks.music.prompt && <CardDescription>{tracks.music.prompt}</CardDescription>}
              </CardHeader>
              <CardContent>
                <audio controls preload="metadata" src={file(tracks.music.path)} className="w-full" />
              </CardContent>
            </Card>
          )}
          {tracks.voices.length > 0 && (
            <Card className="gap-0 py-0 shadow-surface">
              <CardHeader className="py-4">
                <CardTitle className="flex items-center gap-2">
                  <MicIcon className="size-4 text-primary" /> Voix off · {tracks.voices.length} frames
                </CardTitle>
              </CardHeader>
              <ol className="divide-y border-t">
                {tracks.voices.map((voice) => (
                  <li key={voice.path} className="grid gap-3 px-6 py-4 md:grid-cols-[auto_1fr_minmax(0,18rem)] md:items-center">
                    <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">{voice.frame}</span>
                    <p className="text-sm">{voice.text || <span className="text-muted-foreground">Texte indisponible</span>}</p>
                    <audio controls preload="none" src={file(voice.path)} className="h-9 w-full" />
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
      )}
    </StepPage>
  );
}
