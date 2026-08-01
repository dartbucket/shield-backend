import { Router, Request, Response } from "express";
import { AppError, ErrorCode } from "../errors";
import { Device } from "../models";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { updateDeviceNameSchema } from "../validators";

export function createDeviceRouter(): Router {
  const router = Router();

  router.use(authenticate);

  router.get(
    "/devices",
    asyncHandler(async (req: Request, res: Response) => {
      const devices = await Device.find({
        userId: req.token!.userId,
      }).sort({ createdAt: -1 });

      res.json({ devices });
    })
  );

  router.patch(
    "/devices/:id/name",
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = updateDeviceNameSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          400,
          parsed.error.errors.map((e) => e.message).join(", ")
        );
      }

      const device = await Device.findOne({
        _id: req.params.id,
        userId: req.token!.userId,
      });

      if (!device) {
        throw new AppError(ErrorCode.DEVICE_NOT_FOUND, 404, "Device not found");
      }

      device.deviceName = parsed.data.deviceName;
      await device.save();

      res.json({ device });
    })
  );

  router.delete(
    "/devices/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const device = await Device.findOne({
        _id: req.params.id,
        userId: req.token!.userId,
      });

      if (!device) {
        throw new AppError(ErrorCode.DEVICE_NOT_FOUND, 404, "Device not found");
      }

      device.revoked = true;
      await device.save();

      res.json({ message: "Device revoked" });
    })
  );

  return router;
}
