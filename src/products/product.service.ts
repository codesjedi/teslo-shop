import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { validate as isUUID } from 'uuid';

import { PaginationDto } from 'src/common/dtos/pagination.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './entities/product.entity';
import { ProductImage } from './entities';

@Injectable()
export class ProductService {
  private readonly logger = new Logger('ProductService');

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,

    @InjectRepository(ProductImage)
    private readonly productImageRepository: Repository<ProductImage>,
  ) {}

  async create(createProductDto: CreateProductDto) {
    try {
      const { images = [], ...productDetails } = createProductDto;
      const product = this.productRepository.create({
        ...productDetails,
        images: images.map((image) =>
          this.productImageRepository.create({ url: image }),
        ),
      });
      await this.productRepository.save(product);
      return { ...product, images };
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async findAll(paginationDto: PaginationDto) {
    const { limit, offset } = paginationDto;
    const products = await this.productRepository.find({
      take: limit,
      skip: offset,
      relations: {
        images: true,
      },
    });
    return products.map((product) => ({
      ...product,
      images: product.images.map((img) => img.url),
    }));
  }

  async findOne(term: string) {
    let product: Product;

    if (isUUID(term)) {
      product = await this.productRepository.findOneBy({ id: term });
    } else {
      const queryBuilder = this.productRepository.createQueryBuilder('prod');
      product = await queryBuilder
        .where(`UPPER(title) = :title or slug = :slug`, {
          title: term.toUpperCase(),
          slug: term.toLowerCase(),
        })
        .leftJoinAndSelect('prod.images', 'prodImages')
        .getOne();
    }

    if (!product) throw new NotFoundException(`Product ${term} not found`);
    return product;
  }

  async findOnePlain(term: string) {
    const { images, ...rest } = await this.findOne(term);
    return {
      ...rest,
      images: images.map((image) => image.url),
    };
  }

  async update(id: string, updateProductDto: UpdateProductDto) {
    try {
      const product = await this.productRepository.preload({
        id: id,
        ...updateProductDto,
        images: [],
      });
      if (!product) {
        throw new BadRequestException(`Product with id ${id} not found`);
      }
      await this.productRepository.save(product);
      return product;
    } catch (error) {
      this.logger.error(error);
      this.handleDbExceptions(error);
    }
  }

  async remove(id: string) {
    const { affected } = await this.productRepository.delete(id);
    if (affected > 0) {
      return {
        message: `Product ${id} removed succesfully.`,
      };
    }
    throw new NotFoundException(`Product ${id} not found`);
  }

  private handleDbExceptions(error: any) {
    if (error.code === '23505') throw new BadRequestException(error.detail);
    this.logger.error(error);
    throw new InternalServerErrorException('Ayuda');
  }
}
