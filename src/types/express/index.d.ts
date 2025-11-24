import { IUserJwtPayload } from "../../interfaces/userJwtPayload.interface";

declare global {
  namespace Express {
    interface Request {
      user?: IUserJwtPayload;
    }
  }
}
