import { User } from '../modules/users/user.entity';
import { Verification } from '../modules/auth/entities';
import { MessageJob } from '../modules/messaging/message-job.entity';
import { UserAddress } from '../modules/locations/user-address.entity';
import { DeliveryOrder } from '../modules/orders/order.entity';
export const entities = [
  User,
  Verification,
  MessageJob,
  UserAddress,
  DeliveryOrder,
];
