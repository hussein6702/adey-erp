import { useRef, useState, useEffect } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";

export function SignaturePad({ onSave, className }) {
  const sigCanvas = useRef({});
  const [isEmpty, setIsEmpty] = useState(true);

  // Initialize or handle resize
  useEffect(() => {
    const handleResize = () => {
      // Force rerender or adjust canvas, react-signature-canvas handles some automatically
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const clear = () => {
    sigCanvas.current.clear();
    setIsEmpty(true);
  };

  const save = () => {
    if (sigCanvas.current.isEmpty()) {
      alert("Please provide a signature first.");
      return;
    }
    const dataUrl = sigCanvas.current.getTrimmedCanvas().toDataURL("image/png");
    onSave(dataUrl);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="border border-input rounded-md bg-white w-full">
        <SignatureCanvas
          ref={sigCanvas}
          canvasProps={{
            className: "w-full h-40 rounded-md cursor-crosshair touch-none",
          }}
          onEnd={() => setIsEmpty(false)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={clear}>
          Clear
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={isEmpty}>
          Confirm Signature
        </Button>
      </div>
    </div>
  );
}
