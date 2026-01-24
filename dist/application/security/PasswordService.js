import bcrypt from "bcryptjs";
export class PasswordService {
    async hash(password) {
        return await bcrypt.hash(password, 10);
    }
    async verify(password, hash) {
        return await bcrypt.compare(password, hash);
    }
}
