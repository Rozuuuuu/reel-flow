import { expect, test } from "@playwright/test";

/**
 * Ensures the floating upload dock never overlaps the right-side action rail
 * or the caption block on the Feed across iOS notch + small Android devices.
 * Also asserts the dock sits above page chrome (z-index stacking is correct).
 */
test.describe("Mobile feed: dock vs. action rail / caption", () => {
  test("dock does not cover right action buttons or caption", async ({ page }) => {
    await page.goto("/");

    // Wait for the floating dock + at least one video card to render.
    const dock = page.locator("nav[aria-label='Primary']").first();
    await dock.waitFor({ state: "visible" });

    const actions = page.getByTestId("video-actions").first();
    const caption = page.getByTestId("video-caption").first();
    await actions.waitFor({ state: "visible" });
    await caption.waitFor({ state: "visible" });

    const [dockBox, actionsBox, captionBox] = await Promise.all([
      dock.boundingBox(),
      actions.boundingBox(),
      caption.boundingBox(),
    ]);

    expect(dockBox, "dock bounding box").not.toBeNull();
    expect(actionsBox, "actions bounding box").not.toBeNull();
    expect(captionBox, "caption bounding box").not.toBeNull();

    // The bottom edge of actions/caption must sit above the top of the dock.
    const dockTop = dockBox!.y;
    const actionsBottom = actionsBox!.y + actionsBox!.height;
    const captionBottom = captionBox!.y + captionBox!.height;

    expect(actionsBottom, "right action rail clears the dock").toBeLessThanOrEqual(dockTop);
    expect(captionBottom, "caption clears the dock").toBeLessThanOrEqual(dockTop);
  });

  test("dock is the topmost fixed element at the bottom edge", async ({ page }) => {
    await page.goto("/");
    const dock = page.locator("nav[aria-label='Primary']").first();
    const box = await dock.boundingBox();
    expect(box).not.toBeNull();
    // Hit-test a point inside the dock — it must resolve to the dock subtree.
    const point = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
    const isDock = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return !!el?.closest("nav[aria-label='Primary']");
    }, point);
    expect(isDock).toBe(true);
  });
});
