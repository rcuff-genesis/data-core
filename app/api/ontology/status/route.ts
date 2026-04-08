import { OntologyQueryService } from "@/src/ontology/queryService";

export const runtime = "nodejs";

const ontologyQueryService = new OntologyQueryService();

export async function GET() {
  try {
    const summary = await ontologyQueryService.getStatusSummary();

    return Response.json({
      ok: true,
      summary,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load ontology status.",
      },
      { status: 500 },
    );
  }
}
