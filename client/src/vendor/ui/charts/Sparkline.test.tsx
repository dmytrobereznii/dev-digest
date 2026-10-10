import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Sparkline } from "./Sparkline";

describe("Sparkline", () => {
  it("one point draws a dot and no NaN coordinate", () => {
    const { container } = render(<Sparkline data={[0.6]} w={80} h={24} />);
    const circle = container.querySelector("circle");
    expect(circle).not.toBeNull();
    expect(circle!.getAttribute("cx")).toBe("40");
    expect(circle!.getAttribute("cy")).toBe("12");
    expect(container.innerHTML).not.toContain("NaN");
  });
});
