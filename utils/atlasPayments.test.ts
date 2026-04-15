import { expect, jest, test } from "@jest/globals";

jest.mock("expo-web-browser", () => ({
    openBrowserAsync: jest.fn(async () => ({ type: "opened" }))
}));

import { getAtlasStripeLocalStatus, getAtlasStripeMode } from "./atlasPayments";

test("stripe local status defaults to a safe disabled mode when env is absent", () => {
    const status = getAtlasStripeLocalStatus();

    expect(getAtlasStripeMode()).toBe("disabled");
    expect(status.enabled).toBe(false);
    expect(status.mode).toBe("disabled");
    expect(status.checkoutReady).toBe(false);
    expect(status.customerPortalReady).toBe(false);
    expect(status.fundingSessionReady).toBe(false);
});
