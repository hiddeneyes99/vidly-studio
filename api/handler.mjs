import handler from "../artifacts/api-server/dist/handler.mjs";

export default function (req, res) {
  if (req.url && !req.url.startsWith("/api")) {
    req.url = req.url === "/" ? "/api" : "/api" + req.url;
  }
  return handler(req, res);
}
