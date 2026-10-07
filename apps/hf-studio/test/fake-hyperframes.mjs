#!/usr/bin/env node
// Stand-in for `hyperframes preview <dir> --port=<p>`: serves the directory name on that port.
import { createServer } from "node:http";

const args = process.argv.slice(2);
const dir = args[1];
const port = Number(args.find((a) => a.startsWith("--port="))?.slice(7));
createServer((_req, res) => res.end(`studio:${dir}`)).listen(port, "127.0.0.1");
