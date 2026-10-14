import { APPROVAL_TAGS, type ApprovalStatus } from './embroidery.server';

/** Minimal shape of the Admin GraphQL client returned by `authenticate.*`. */
interface AdminGraphql {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

const TAGS_MUTATION = `#graphql
  mutation EmbroideryApprovalTags($id: ID!, $add: [String!]!, $remove: [String!]!) {
    tagsRemove(id: $id, tags: $remove) { userErrors { message } }
    tagsAdd(id: $id, tags: $add) { userErrors { message } }
  }`;

/**
 * Swaps the order's logo-review tag ("logo-review" → "logo-approved" / "logo-changes-requested"),
 * so staff can filter orders in Shopify admin. Needs the write_orders scope.
 */
export async function setApprovalTag(admin: AdminGraphql, orderId: string, status: ApprovalStatus) {
  const id = orderId.startsWith('gid://') ? orderId : `gid://shopify/Order/${orderId}`;
  const add = [APPROVAL_TAGS[status]];
  const remove = Object.values(APPROVAL_TAGS).filter((t) => !add.includes(t));
  const res = await admin.graphql(TAGS_MUTATION, { variables: { id, add, remove } });
  const body = (await res.json()) as {
    data?: Record<string, { userErrors: { message: string }[] } | null>;
    errors?: unknown;
  };
  const errors = [
    ...Object.values(body.data ?? {}).flatMap((r) => r?.userErrors ?? []),
    ...(body.errors ? [{ message: JSON.stringify(body.errors) }] : []),
  ];
  if (errors.length) throw new Error(errors.map((e) => e.message).join('; '));
}
