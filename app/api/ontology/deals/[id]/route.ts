import { OntologyQueryService } from "@/src/ontology/queryService";

export const runtime = "nodejs";

const ontologyQueryService = new OntologyQueryService();

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const dealContext = await ontologyQueryService.getDealContext(id);

    if (!dealContext) {
      return Response.json(
        {
          ok: false,
          error: `Deal not found for id "${id}".`,
        },
        { status: 404 },
      );
    }

    return Response.json({
      ok: true,
      data: dealContext,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Failed to load deal context.",
      },
      { status: 500 },
    );
  }
}
