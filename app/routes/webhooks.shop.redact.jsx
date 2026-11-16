import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function action({ request }) {
  const { shop } = await authenticate.webhook(request);

  await prisma.$transaction([
    prisma.bulkUpdateJob.deleteMany({ where: { shop } }),
    prisma.session.deleteMany({ where: { shop } }),
  ]);

  return new Response(null, { status: 200 });
}

