import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import aiRouter from "./ai";
import creatorDataRouter from "./creator-data";
import chatRouter from "./chat";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// Public routes
router.use(healthRouter);
router.use(authRouter);

// Protected routes
router.use(requireAuth, aiRouter);
router.use(requireAuth, creatorDataRouter);
router.use(requireAuth, chatRouter);

export default router;
