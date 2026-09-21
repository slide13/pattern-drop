import { handleSessionRequest } from "../../../../server/sessions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Do not forward the framework's route context as the optional storage argument.
const handle = (request: Request) => handleSessionRequest(request);
export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
