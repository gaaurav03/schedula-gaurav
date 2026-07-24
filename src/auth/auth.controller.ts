import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/signup
   * Register a new user with role DOCTOR or PATIENT.
   *
   * @body SignupDto - { name, email, password, role }
   * @returns 201 Created with JWT access token and user profile
   */
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  /**
   * POST /auth/login
   * Authenticate an existing user and receive a JWT.
   *
   * @body LoginDto - { email, password }
   * @returns 200 OK with JWT access token and user profile
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
