import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { config as appConfig } from "@/lib/config";
import { getRuleByRealPath, getRuleByRealPathPrefix } from "@/lib/repo";
import { getSessionByToken } from "@/lib/session";
import { gateValid } from "@/lib/guard";

function raw403(body: string) {
  return new NextResponse(body, {
    status: 403,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function proxyToTarget(request: NextRequest, target: string): Promise<NextResponse> {
  const url = new URL(request.url);
  const targetUrl = new URL(url.pathname + url.search, target);
  const headers = new Headers(request.headers);
  headers.set("x-forwarded-host", url.host);
  headers.set("x-original-url", url.toString());
  headers.delete("host");

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    // @ts-expect-error duplex is needed for streaming body in fetch
    init.duplex = "half";
  }

  try {
    const resp = await fetch(targetUrl.toString(), init);
    const respHeaders = new Headers(resp.headers);
    respHeaders.delete("content-security-policy");
    return new NextResponse(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: respHeaders,
    });
  } catch {
    return raw403("Upstream service unavailable");
  }
}

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;
  const trueClient = req.headers.get("true-client-ip");
  if (trueClient) return trueClient;
  return "";
}

export async function proxy(request: NextRequest) {
  try {
  if (process.env.NODE_ENV === "production" && appConfig.allowedIps.length > 0) {
    const ip = clientIp(request);
    const isLocal = ip === "127.0.0.1" || ip === "::1" || ip === "";
    if (!isLocal && !appConfig.allowedIps.includes(ip)) {
      return raw403("IP not authorized");
    }
  }

  const rawPath = new URL(request.url).pathname;
  const path = rawPath.length > 1 ? rawPath.replace(/\/+$/, "") : rawPath;
  let rule = await getRuleByRealPath(path);
  if (!rule && rawPath.length > 1) {
    rule = await getRuleByRealPathPrefix(rawPath.replace(/\/+$/, ""));
  }
  if (rule) {
    const token = request.cookies.get(appConfig.session.cookieName)?.value;
    const session = token ? await getSessionByToken(token) : null;
    if (!gateValid(session?.data, rule.id)) {
      return raw403("Access restricted. Please contact the administrator.");
    }
    if (appConfig.gateProxyTarget) {
      return proxyToTarget(request, appConfig.gateProxyTarget);
    }
  }

  const nonce = crypto.randomBytes(32).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
  } catch (err) {
    console.error("proxy middleware error:", err);
    return raw403("Internal error");
  }
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
