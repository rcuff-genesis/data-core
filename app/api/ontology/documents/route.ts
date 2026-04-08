import { OntologyQueryService } from "@/src/ontology/queryService";

export const runtime = "nodejs";

const ontologyQueryService = new OntologyQueryService();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query")?.trim() ?? "";
    const limit = Number(searchParams.get("limit") ?? "10");

    if (!query) {
      return Response.json(
        {
          ok: false,
          error: 'Query parameter "query" is required.',
        },
        { status: 400 },
      );
    }

    const documents = await ontologyQueryService.searchDocuments(query, limit);

    return Response.json({
      ok: true,
      documents,
      count: documents.length,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to search documents.",
      },
      { status: 500 },
    );
  }
}
