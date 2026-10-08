import { Controller, Get, Inject, Param, ParseUUIDPipe, Sse, type MessageEvent } from "@nestjs/common";
import { jobEventsChannel } from "@studio/shared";
import IORedis from "ioredis";
import { Observable, from, switchMap } from "rxjs";
import { REDIS } from "../queues/queues.module";
import { JobsService } from "./jobs.service";

const FINAL = new Set(["succeeded", "failed", "cancelled", "waiting_review"]);

@Controller("jobs")
export class JobsController {
  constructor(
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(REDIS) private readonly redis: IORedis,
  ) {}

  @Get(":id")
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.jobs.get(id);
  }

  /**
   * Server-sent events: the stored history first, then the live Redis channel.
   * Subscribing before reading the history and dropping already-sent sequence
   * numbers means no event is lost or duplicated in between.
   */
  @Sse(":id/events")
  stream(@Param("id", ParseUUIDPipe) id: string): Observable<MessageEvent> {
    // Ownership first, inside the request: the stream itself outlives the request context.
    return from(this.jobs.get(id)).pipe(switchMap(() => this.feed(id)));
  }

  private feed(id: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const sub = this.redis.duplicate();
      const channel = jobEventsChannel(id);
      let lastSeq = 0;
      let replayed = false;
      const pending: string[] = [];

      const deliver = (raw: string) => {
        const message = JSON.parse(raw) as { seq?: number; status?: string };
        if (message.seq !== undefined) {
          if (message.seq <= lastSeq) return;
          lastSeq = message.seq;
        }
        subscriber.next({ data: message });
        if (message.status && FINAL.has(message.status)) subscriber.complete();
      };

      sub.on("message", (_channel: string, raw: string) => (replayed ? deliver(raw) : pending.push(raw)));
      sub
        .subscribe(channel)
        .then(async () => {
          for (const row of await this.jobs.events(id)) {
            lastSeq = row.seq;
            subscriber.next({ data: { seq: row.seq, event: row.event } });
          }
          const status = await this.jobs.status(id);
          replayed = true;
          pending.splice(0).forEach(deliver);
          if (FINAL.has(status)) {
            subscriber.next({ data: { status } });
            subscriber.complete();
          }
        })
        .catch((error: unknown) => subscriber.error(error));

      return () => {
        sub.disconnect();
      };
    });
  }
}
