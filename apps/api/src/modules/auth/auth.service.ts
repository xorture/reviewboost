import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { Tenant, SubscriptionStatus, SubscriptionPlan } from '../tenants/tenant.entity';
import { Settings, DEFAULT_MESSAGE_TEMPLATE } from '../settings/settings.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

export interface JwtPayload {
  sub: string;      // tenant id
  email: string;
  plan: SubscriptionPlan;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = 12;
  private readonly TRIAL_DAYS = 14;

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,

    @InjectRepository(Settings)
    private readonly settingsRepo: Repository<Settings>,

    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Register a new tenant (business owner).
   * Creates tenant + default Settings in a transaction.
   */
  async register(dto: RegisterDto): Promise<{ tenant: Tenant; tokens: AuthTokens }> {
    // Check email uniqueness
    const existing = await this.tenantRepo.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    // Trial ends in 14 days
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + this.TRIAL_DAYS);

    const tenant = this.tenantRepo.create({
      businessName: dto.businessName,
      ownerName: dto.ownerName,
      email: dto.email,
      passwordHash,
      phoneNumber: dto.phoneNumber,
      address: dto.address ?? '',
      cui: dto.cui,
      subscriptionStatus: SubscriptionStatus.TRIAL,
      subscriptionPlan: SubscriptionPlan.BASIC,
      trialEndsAt,
      isActive: true,
      emailVerified: false,
    });

    const savedTenant = await this.tenantRepo.save(tenant);

    // Create default settings for this tenant
    const settings = this.settingsRepo.create({
      tenantId: savedTenant.id,
      delayMinutes: 60,
      messageTemplate: DEFAULT_MESSAGE_TEMPLATE,
      spamFilterDays: 30,
      positiveScoreThreshold: 4,
      notifyNegativeEmail: true,
      notificationEmail: dto.email,
      isActive: true,
    });
    await this.settingsRepo.save(settings);

    this.logger.log(`New tenant registered: ${savedTenant.email} (${savedTenant.id})`);

    const tokens = await this.generateTokens(savedTenant);
    return { tenant: savedTenant, tokens };
  }

  /**
   * Login with email + password.
   */
  async login(dto: LoginDto): Promise<{ tenant: Tenant; tokens: AuthTokens }> {
    const tenant = await this.tenantRepo.findOne({ where: { email: dto.email } });

    if (!tenant || !tenant.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, tenant.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(tenant);
    return { tenant, tokens };
  }

  /**
   * Refresh access token using refresh token.
   */
  async refreshTokens(tenantId: string, refreshToken: string): Promise<AuthTokens> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant || !tenant.isActive) {
      throw new UnauthorizedException('Access denied');
    }

    try {
      this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.generateTokens(tenant);
  }

  /**
   * Validate JWT payload (called by JwtStrategy on every request).
   */
  async validatePayload(payload: JwtPayload): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({ where: { id: payload.sub } });
    if (!tenant || !tenant.isActive) {
      throw new UnauthorizedException();
    }
    return tenant;
  }

  /**
   * Generate access + refresh token pair.
   */
  private async generateTokens(tenant: Tenant): Promise<AuthTokens> {
    const payload: JwtPayload = {
      sub: tenant.id,
      email: tenant.email,
      plan: tenant.subscriptionPlan,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '30d'),
      }),
    ]);

    return { accessToken, refreshToken, expiresIn: 7 * 24 * 60 * 60 };
  }
}
