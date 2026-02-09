import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { NodesService } from './nodes.service';
import { CreateEnrollmentDto } from './dto/create-enroll.dto';
import { RegisterNodeDto } from './dto/register-node.dto';
import { CreateAllocationsDto } from './dto/create-allocations.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permission, UserRole } from '@prisma/client';

/**
 * Controller responsible for handling operations related to nodes, including enrollment, health checks, and node management.
 *
 * Most endpoints require authentication and admin role or specific permissions.
 */
@Controller('nodes')
export class NodesController {
  constructor(private nodes: NodesService) {}

  /**
   * Create node enrollment token
   *
   * Admin only - requires ADMIN role
   */
  @Post('enroll')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  createEnrollment(@Body() dto: CreateEnrollmentDto) {
    return this.nodes.createEnrollment(dto);
  }

  /**
   * Register a node using enrollment token
   *
   * Public endpoint - used by agent during initial setup
   */
  @Post('register')
  register(@Body() dto: RegisterNodeDto) {
    return this.nodes.registerNode(dto);
  }

  /**
   * List all nodes
   *
   * Requires NODE_READ permission
   */
  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.NODE_READ)
  listNodes() {
    return this.nodes.listNodes();
  }

  /**
   * Get specific node details
   *
   * Requires NODE_READ permission
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.NODE_READ)
  getNode(@Param('id') id: string) {
    return this.nodes.getNode(id);
  }

  /**
   * Ping a specific node
   *
   * Requires NODE_READ permission
   */
  @Post(':id/ping')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.NODE_READ)
  ping(@Param('id') id: string) {
    return this.nodes.pingNode(id);
  }

  /**
   * Test node authentication
   *
   * Admin only - requires ADMIN role
   */
  @Post(':id/auth-test')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  authTest(@Param('id') id: string, @Body() body: any) {
    return this.nodes.authTest(id, body);
  }

  /**
   * Ping all nodes
   *
   * Requires NODE_READ permission
   */
  @Post('ping-all')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.NODE_READ)
  pingAll() {
    return this.nodes.pingAllNodes();
  }

  /**
   * Create allocations for a node
   *
   * Requires ALLOCATION_CREATE permission
   */
  @Post(':id/allocations')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.ALLOCATION_CREATE)
  createAllocations(
    @Param('id') id: string,
    @Body() dto: CreateAllocationsDto,
  ) {
    return this.nodes.createAllocations(id, dto);
  }
}
