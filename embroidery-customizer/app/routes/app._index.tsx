import type { HeadersFunction, LoaderFunctionArgs } from 'react-router';
import { Form, useLoaderData } from 'react-router';
import { boundary } from '@shopify/shopify-app-react-router/server';
import {
  findFont,
  findThreadColor,
  formatDimensions,
  getModelAdapter,
  getPreset,
  parseConfiguration,
  textLines,
} from '@embroidery/shared';
import { authenticate } from '../shopify.server';
import db from '../db.server';
import { getStorage } from '../lib/storage.server';
import { signedMediaUrl } from '../lib/signedMedia.server';

/** Fulfilment lookup: search by the Customization ID printed on the packing slip. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  const rows = await db.embroideryConfiguration.findMany({
    where: { shop: session.shop, ...(q ? { customizationId: { contains: q } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  let storageKind = 'unknown';
  try {
    storageKind = getStorage().kind;
  } catch (e) {
    storageKind = `misconfigured: ${(e as Error).message}`;
  }
  return {
    q,
    storageKind,
    designs: rows.map((r) => {
      const c = parseConfiguration(r.json);
      const adapter = getModelAdapter(c.product.modelId);
      return {
        id: r.id,
        customizationId: r.customizationId,
        createdAt: r.createdAt.toISOString(),
        order: r.orderName ?? null,
        variant: c.product.variantTitle ?? c.product.variantId,
        team: c.teamOrderId ? c.teamOrderId.slice(0, 8).toUpperCase() : null,
        designs: c.layers.map((l) => ({
          placement: getPreset(adapter, l.placement.positionId)?.label ?? l.placement.positionId,
          size: l.rendered ? formatDimensions(l.rendered.widthCm, l.rendered.heightCm) : '—',
          summary:
            l.design.type === 'text'
              ? `“${textLines(l.design.text).join(' / ')}” · ${findFont(l.design.fontId)?.label} · ${findThreadColor(l.design.threadColorId)?.label} thread`
              : `Logo: ${l.design.originalFilename}${l.design.backgroundRemoved ? ' (background removed)' : ''}`,
          downloadUrl:
            l.design.type === 'image' && l.design.storageRef
              ? signedMediaUrl(session.shop, l.design.storageRef, { download: true })
              : null,
        })),
        mockupUrl: r.previewRef ? signedMediaUrl(session.shop, r.previewRef) : null,
        approval: r.approvalStatus,
      };
    }),
  };
};

export default function Index() {
  const { q, designs, storageKind } = useLoaderData<typeof loader>();
  return (
    <s-page heading="Embroidery designs">
      <s-section heading="Find a design">
        <Form method="get">
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-text-field
              label="Customization ID (from the order or packing slip)"
              name="q"
              value={q}
            />
            <s-button type="submit">Search</s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading={q ? `Results for “${q}”` : 'Recent designs'}>
        {designs.length === 0 ? (
          <s-paragraph>
            No designs yet. They appear here as soon as customers add a customized item to their
            cart.
          </s-paragraph>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th>Customization ID</th>
                <th>Designs</th>
                <th>Variant</th>
                <th>Order</th>
              </tr>
            </thead>
            <tbody>
              {designs.map((d) => (
                <tr key={d.id} style={{ borderTop: '1px solid #e3e3e3', verticalAlign: 'top' }}>
                  <td style={{ fontFamily: 'monospace', padding: '8px 4px' }}>
                    {d.customizationId.slice(0, 8)}…
                  </td>
                  <td style={{ padding: '8px 4px' }}>
                    {d.designs.map((x, i) => (
                      <div key={i} style={{ marginBottom: 4 }}>
                        <strong>{x.placement}</strong> ({x.size}) — {x.summary}{' '}
                        {x.downloadUrl ? (
                          <a href={x.downloadUrl} target="_blank" rel="noreferrer">
                            Download
                          </a>
                        ) : null}
                      </div>
                    ))}
                    {d.team ? <s-badge>Team {d.team}</s-badge> : null}
                    {d.approval ? (
                      <s-badge
                        tone={
                          d.approval === 'approved'
                            ? 'success'
                            : d.approval === 'pending'
                              ? 'warning'
                              : 'critical'
                        }
                      >
                        Logo {d.approval.replace('_', ' ')}
                      </s-badge>
                    ) : null}
                    {d.mockupUrl ? (
                      <div>
                        <a href={d.mockupUrl} target="_blank" rel="noreferrer">
                          View mockup
                        </a>
                      </div>
                    ) : null}
                  </td>
                  <td style={{ padding: '8px 4px' }}>{d.variant}</td>
                  <td style={{ padding: '8px 4px' }}>
                    {d.order ? (
                      <s-badge tone="success">{d.order}</s-badge>
                    ) : (
                      <s-badge>In a cart</s-badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </s-section>

      <s-section slot="aside" heading="Setup">
        <s-unordered-list>
          <s-list-item>
            Online Store → Themes → Customize → product template → Add block → Apps → Embroidery
            customizer.
          </s-list-item>
          <s-list-item>App embeds → enable “Embroidery: edit in cart”.</s-list-item>
          <s-list-item>
            Settings → Shipping and delivery → Packing slip template → paste the embroidery snippet.
          </s-list-item>
        </s-unordered-list>
        <s-paragraph>Artwork storage: {storageKind}</s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
