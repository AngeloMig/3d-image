import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { boundary } from '@shopify/shopify-app-react-router/server';
import {
  findFont,
  findStitchStyle,
  findThreadColor,
  formatDimensions,
  getModelAdapter,
  getPreset,
  parseConfiguration,
  textLines,
} from '@embroidery/shared';
import { authenticate } from '../shopify.server';
import { EmbroideryError, type ApprovalStatus } from '../lib/embroidery.server';
import { setApprovalTag } from '../lib/orderTags.server';
import { embroidery } from '../lib/service.server';
import { signedMediaUrl } from '../lib/signedMedia.server';

const FILTERS: { value: ApprovalStatus | 'all'; label: string }[] = [
  { value: 'pending', label: 'To review' },
  { value: 'changes_requested', label: 'Changes requested' },
  { value: 'approved', label: 'Approved' },
  { value: 'all', label: 'All' },
];

/** Staff queue: every ordered design with an uploaded logo is checked before stitching. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const raw = new URL(request.url).searchParams.get('status');
  const status = FILTERS.some((f) => f.value === raw) ? (raw as ApprovalStatus | 'all') : 'pending';
  const rows = await embroidery().listApprovals(session.shop, status);
  return {
    status,
    items: rows.map((r) => {
      const c = parseConfiguration(r.json);
      const adapter = getModelAdapter(c.product.modelId);
      return {
        id: r.id,
        orderId: r.orderId,
        orderName: r.orderName,
        orderedAt: r.orderedAt?.toISOString() ?? null,
        status: r.approvalStatus as ApprovalStatus,
        note: r.approvalNote,
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        variant: c.product.variantTitle ?? '',
        mockupUrl: r.previewRef ? signedMediaUrl(session.shop, r.previewRef) : null,
        layers: c.layers.map((l) => {
          const where = `${getPreset(adapter, l.placement.positionId)?.label ?? l.placement.positionId}${l.rendered ? ` · ${formatDimensions(l.rendered.widthCm, l.rendered.heightCm)}` : ''}`;
          const d = l.design;
          return d.type === 'image'
            ? {
                kind: 'logo' as const,
                where,
                title: d.originalFilename,
                detail: `${findStitchStyle(d.stitchStyle).label}${d.backgroundRemoved ? ' · background removed' : ''} · ${d.widthPx}×${d.heightPx}px`,
                imageUrl: d.storageRef ? signedMediaUrl(session.shop, d.storageRef) : null,
                downloadUrl: d.storageRef
                  ? signedMediaUrl(session.shop, d.storageRef, { download: true })
                  : null,
              }
            : {
                kind: 'text' as const,
                where,
                title: `“${textLines(d.text).join(' / ')}”`,
                detail: `${findFont(d.fontId)?.label} · ${findThreadColor(d.threadColorId)?.label} thread · ${findStitchStyle(d.stitchStyle).label}`,
                imageUrl: null,
                downloadUrl: null,
              };
        }),
      };
    }),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const id = String(form.get('id') ?? '');
  const decision = form.get('intent') === 'approve' ? 'approved' : 'changes_requested';
  try {
    const result = await embroidery().reviewDesign(
      session.shop,
      id,
      decision,
      String(form.get('note') ?? ''),
    );
    let tagWarning: string | null = null;
    if (result.orderId && (decision === 'changes_requested' || result.orderSettled)) {
      try {
        await setApprovalTag(admin, result.orderId, decision);
      } catch (e) {
        tagWarning = `Saved, but the order tag couldn't be updated (${(e as Error).message}).`;
      }
    }
    return {
      ok: true,
      id,
      message:
        tagWarning ??
        (decision === 'approved'
          ? `Approved${result.orderName ? ` for ${result.orderName}` : ''}.`
          : `Changes requested${result.orderName ? ` for ${result.orderName}` : ''}. Contact the customer from the order page.`),
    };
  } catch (e) {
    if (e instanceof EmbroideryError) return { ok: false, id, message: e.message };
    throw e;
  }
};

const TONE: Record<ApprovalStatus, 'warning' | 'critical' | 'success'> = {
  pending: 'warning',
  changes_requested: 'critical',
  approved: 'success',
};
const LABEL: Record<ApprovalStatus, string> = {
  pending: 'To review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
};

export default function Approvals() {
  const { status, items } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const nav = useNavigation();
  const busyId = nav.state !== 'idle' ? String(nav.formData?.get('id') ?? '') : null;

  return (
    <s-page heading="Logo approvals">
      <s-section>
        <s-paragraph>
          Every order with an uploaded logo lands here before stitching. Check that the artwork is
          sharp and stitchable, then approve it or ask the customer for changes. Orders are tagged
          <strong> logo-review</strong>, <strong>logo-approved</strong> or{' '}
          <strong>logo-changes-requested</strong> so you can filter them in Orders.
        </s-paragraph>
        <s-stack direction="inline" gap="small-200">
          {FILTERS.map((f) => (
            <s-button
              key={f.value}
              href={`/app/approvals?status=${f.value}`}
              variant={f.value === status ? 'primary' : 'secondary'}
            >
              {f.label}
            </s-button>
          ))}
        </s-stack>
      </s-section>

      {result ? (
        <s-banner tone={result.ok ? 'success' : 'critical'}>{result.message}</s-banner>
      ) : null}

      {items.length === 0 ? (
        <s-section>
          <s-paragraph>
            {status === 'pending'
              ? 'Nothing to review. New logo orders appear here automatically.'
              : 'No designs in this list yet.'}
          </s-paragraph>
        </s-section>
      ) : (
        items.map((item) => (
          <s-section key={item.id} heading={item.orderName ?? 'Order'}>
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-badge tone={TONE[item.status]}>{LABEL[item.status]}</s-badge>
              <s-text>{item.variant}</s-text>
              {item.orderedAt ? (
                <s-text color="subdued">{new Date(item.orderedAt).toLocaleString()}</s-text>
              ) : null}
              {item.orderId ? (
                <s-link href={`shopify://admin/orders/${item.orderId}`}>Open order</s-link>
              ) : null}
            </s-stack>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 12,
                marginTop: 12,
              }}
            >
              {item.mockupUrl ? (
                <figure style={{ margin: 0 }}>
                  <img
                    src={item.mockupUrl}
                    alt="3D mockup the customer saw"
                    style={{ width: '100%', borderRadius: 8, background: '#f4f4f4' }}
                  />
                  <figcaption style={{ fontSize: 12, color: '#616161' }}>
                    Mockup (as sent in the order email)
                  </figcaption>
                </figure>
              ) : null}
              {item.layers.map((l, i) => (
                <figure key={i} style={{ margin: 0 }}>
                  {l.imageUrl ? (
                    <img
                      src={l.imageUrl}
                      alt={l.title}
                      style={{
                        width: '100%',
                        aspectRatio: '1',
                        objectFit: 'contain',
                        borderRadius: 8,
                        // Checkerboard shows transparency in the uploaded logo.
                        background:
                          'repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50% / 16px 16px',
                      }}
                    />
                  ) : null}
                  <figcaption style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                    <strong>{l.where}</strong>
                    <br />
                    {l.title}
                    <br />
                    <span style={{ color: '#616161' }}>{l.detail}</span>
                    {l.downloadUrl ? (
                      <>
                        <br />
                        <a href={l.downloadUrl} target="_blank" rel="noreferrer">
                          Download original
                        </a>
                      </>
                    ) : null}
                  </figcaption>
                </figure>
              ))}
            </div>

            {item.note ? (
              <s-paragraph>
                <strong>Note to customer:</strong> {item.note}
              </s-paragraph>
            ) : null}

            <s-stack direction="block" gap="small-200">
              <Form method="post" style={{ marginTop: 12 }}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="intent" value="approve" />
                <s-button type="submit" variant="primary" loading={busyId === item.id}>
                  Approve logo
                </s-button>
              </Form>
              <Form method="post">
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="intent" value="changes" />
                <s-stack direction="block" gap="small-200">
                  <s-text-area
                    label="Or request changes: note for the customer"
                    name="note"
                    rows={2}
                    value={item.status === 'changes_requested' ? (item.note ?? '') : ''}
                  />
                  <s-button type="submit" tone="critical">
                    Request changes
                  </s-button>
                </s-stack>
              </Form>
            </s-stack>
            {result && result.id === item.id && !result.ok ? (
              <s-text tone="critical">{result.message}</s-text>
            ) : null}
          </s-section>
        ))
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
