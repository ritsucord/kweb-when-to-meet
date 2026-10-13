import { z } from 'zod';

export const CreateUserRequest = z.object({
    name: z.string().min(1),
    email: z.email(),
});
export type CreateUserRequest = z.infer<typeof CreateUserRequest>;