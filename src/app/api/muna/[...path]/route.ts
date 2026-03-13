import { NextRequest, NextResponse } from "next/server"

async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const url = `https://api.muna.ai/v1/${path.join("/")}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.MUNA_ACCESS_KEY}`,
  };
  const contentType = request.headers.get("content-type");
  if (contentType)
    headers["Content-Type"] = contentType;
  const upstream = await fetch(url, {
    method: request.method,
    headers,
    body: request.method !== "GET" ? await request.text() : undefined,
  });
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
    },
  });
}

export const GET = proxy;
export const POST = proxy;