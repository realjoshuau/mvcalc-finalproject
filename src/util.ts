import { compile, EvalFunction } from "mathjs"; // Import math.js compile function

const errorMessageDiv = document.getElementById(
  "errorMessage"
) as HTMLDivElement;
if (!errorMessageDiv) {
  console.error("Error message div not found");
  alert("[STOP] Error message div not found");
  throw new Error("Error message div not found");
}

export function showError(message: string | null) {
  errorMessageDiv.textContent = message;
  errorMessageDiv.classList.remove("hidden");
}

export function hideError() {
  errorMessageDiv.textContent = "";
  errorMessageDiv.classList.add("hidden");
}

// this takes the math function string and creates a function in js that can be used to render

// export function createFunction(argName: string, body: string) {
//   try {
//     // Basic sanitization: allow only Math functions, numbers, operators, 't'
//     const sanitizedBody = body.replace(
//       /[^a-zA-Z0-9\s\.\+\-\*\/\(\)\^t]/g,
//       (match) => {
//         if (match.startsWith("Math.")) {
//           const funcName = match.substring(5);
//           if (typeof Math[funcName as keyof Math] === "function") {
//             return match;
//           }
//         }
//         // Allow 't', numbers, operators, parentheses
//         if (/^[t0-9\s\.\+\-\*\/\(\)\^]$/.test(match)) {
//           return match;
//         }
//         console.warn(`Removing potentially unsafe character: ${match}`);
//         return "";
//       }
//     );

//     if (!sanitizedBody.trim()) {
//       throw new Error("Function body is empty after sanitization.");
//     }

//     // Replace ^ with Math.pow for exponentiation
//     const finalBody = sanitizedBody.replace(/\^/g, "**");

//     return new Function(argName, `return ${finalBody};`);
//   } catch (e: any) {
//     showError(`Error creating function: ${e.message}. Check syntax.`);
//     console.error("Function creation error:", e);
//     return null; // Indicate failure
//   }
// }

export function createFunction(
  argName: string,
  body: string
): ((argValue: number) => number) | null {
  try {
    if (body.trim() === "Math.sin(t)") {
      console.warn("Math.sin replaced with sin(t), cache needs to be cleared");
      body = "sin(t)";
    }
    if (body.trim() === "Math.cos(t)") {
      console.warn("Math.cos replaced with cos(t), cache needs to be cleared");
      body = "cos(t)";
    }
    const compiledExpr: EvalFunction = compile(body);
    return (argValue: number): number => {
      // The scope object maps the argument name (argName, e.g., 't')
      // to the provided argument value (argValue).
      const scope = { [argName]: argValue };
      // Evaluate the compiled expression with the given scope.
      const result = compiledExpr.evaluate(scope);
      // Ensure the result is a number before returning.
      if (typeof result !== "number") {
        throw new Error(
          `Expression did not evaluate to a number. Result: ${result}`
        );
      }
      return result;
    };
  } catch (error: any) {
    showError(
      `Error parsing function "${body}": ${error.message}. Check syntax.`
    );
    console.error(
      "Function creation error: " + error.message + " for body: " + body
    );
    // Return null to indicate failure
    return null;
  }
}

export const gbid = (id: string) => document.getElementById(id);
